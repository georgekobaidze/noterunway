import { Client, isFullPage } from '@notionhq/client'
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

export type NotionPage = PageObjectResponse

export interface WorkspaceStats {
  totalPages: number
  topLevelPages: number
  recentlyEditedPages: number
  duplicateCandidates: number
}

export class NotionError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'NotionError'
  }
}

export class NotionClient {
  private client: Client

  constructor(token: string) {
    this.client = new Client({ auth: token })
  }

  // Fetch all pages from the workspace (handles pagination automatically)
  async getAllPages(): Promise<NotionPage[]> {
    const pages: NotionPage[] = []
    let cursor: string | undefined = undefined

    try {
      do {
        const response = await this.client.search({
          filter: { property: 'object', value: 'page' },
          start_cursor: cursor,
          page_size: 100,
        })

        for (const result of response.results) {
          if (isFullPage(result)) {
            pages.push(result)
          }
        }

        cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
      } while (cursor)
    } catch (err: unknown) {
      throw this.handleError(err)
    }

    return pages
  }

  // Fetch a single page by ID
  async getPage(pageId: string): Promise<NotionPage> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId })
      if (!isFullPage(page)) {
        throw new NotionError('Received a partial page response — check integration permissions.')
      }
      return page
    } catch (err: unknown) {
      throw this.handleError(err)
    }
  }

  // Recursively fetches all blocks including nested children
  private async fetchBlockChildrenRecursively(
    blockId: string,
    blocks: BlockObjectResponse[]
  ): Promise<void> {
    let cursor: string | undefined = undefined
    do {
      const response = await this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      })
      for (const block of response.results) {
        if ('type' in block) {
          const fullBlock = block as BlockObjectResponse
          blocks.push(fullBlock)
          if (fullBlock.has_children) {
            await this.fetchBlockChildrenRecursively(fullBlock.id, blocks)
          }
        }
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
    } while (cursor)
  }

  // Fetch all content blocks of a page, including nested children
  async getPageBlocks(pageId: string): Promise<BlockObjectResponse[]> {
    const blocks: BlockObjectResponse[] = []
    try {
      await this.fetchBlockChildrenRecursively(pageId, blocks)
    } catch (err: unknown) {
      throw this.handleError(err)
    }

    return blocks
  }

  // Soft-delete (archive) a page
  async archivePage(pageId: string): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: pageId,
        archived: true,
      })
    } catch (err: unknown) {
      throw this.handleError(err)
    }
  }

  // Update a page's title
  async updatePageTitle(pageId: string, title: string): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: pageId,
        properties: {
          title: {
            title: [{ type: 'text', text: { content: title } }],
          },
        },
      })
    } catch (err: unknown) {
      throw this.handleError(err)
    }
  }

  // Validate the token by making a lightweight API call
  async validateToken(): Promise<boolean> {
    try {
      await this.client.users.me({})
      return true
    } catch (err: unknown) {
      const normalizedError = this.handleError(err)
      if (normalizedError.code === 'unauthorized') {
        return false
      }
      throw normalizedError
    }
  }

  // Compute workspace health stats from all pages in a single pass
  async getWorkspaceStats(): Promise<WorkspaceStats> {
    const pages = await this.getAllPages()
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    const topLevelPages = pages.filter((p) => p.parent.type !== 'page_id').length

    const recentlyEditedPages = pages.filter(
      (p) => new Date(p.last_edited_time).getTime() > sevenDaysAgo
    ).length

    // Duplicate candidate detection: pages sharing the same normalised title
    const titleCounts = new Map<string, number>()
    for (const page of pages) {
      const titleProp = page.properties['title'] ?? page.properties['Name']
      const titleText =
        titleProp?.type === 'title'
          ? titleProp.title.map((t) => t.plain_text).join('').trim().toLowerCase()
          : ''
      if (titleText) {
        titleCounts.set(titleText, (titleCounts.get(titleText) ?? 0) + 1)
      }
    }
    const duplicateCandidates = [...titleCounts.values()].filter((c) => c > 1).length

    return {
      totalPages: pages.length,
      topLevelPages,
      recentlyEditedPages,
      duplicateCandidates,
    }
  }

  // Compute true link density by scanning block content for page mentions.
  // Returns the fraction of pages that are mentioned by at least one other page.
  async getLinkDensity(): Promise<number> {
    const pages = await this.getAllPages()
    if (pages.length === 0) return 0

    const pageIds = new Set(pages.map((p) => p.id))
    const mentionedIds = new Set<string>()
    const BATCH = 10

    for (let i = 0; i < pages.length; i += BATCH) {
      const batch = pages.slice(i, i + BATCH)
      await Promise.all(
        batch.map(async (page) => {
          try {
            let cursor: string | undefined = undefined
            do {
              const res = await this.client.blocks.children.list({
                block_id: page.id,
                start_cursor: cursor,
                page_size: 100,
              })
              for (const block of res.results) {
                if (!('type' in block)) continue
                const b = block as BlockObjectResponse
                // Extract rich text arrays from common block types
                const richTexts = getRichTexts(b)
                for (const rt of richTexts) {
                  if (rt.type === 'mention' && rt.mention.type === 'page') {
                    const id = rt.mention.page.id
                    if (pageIds.has(id)) mentionedIds.add(id)
                  }
                }
              }
              cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
            } while (cursor)
          } catch {
            // skip inaccessible pages
          }
        })
      )
    }

    return Math.round((mentionedIds.size / pages.length) * 100) / 100
  }

  // Count pages with no content blocks. Batches requests to avoid rate limits.
  async getEmptyPageCount(): Promise<number> {
    const pages = await this.getAllPages()
    let emptyCount = 0
    const BATCH = 10

    for (let i = 0; i < pages.length; i += BATCH) {
      const batch = pages.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(async (page) => {
          try {
            const res = await this.client.blocks.children.list({
              block_id: page.id,
              page_size: 1,
            })
            return res.results.length === 0
          } catch {
            return false
          }
        })
      )
      emptyCount += results.filter(Boolean).length
    }

    return emptyCount
  }

  private handleError(err: unknown): NotionError {
    if (err instanceof NotionError) return err

    if (typeof err === 'object' && err !== null && 'code' in err) {
      const e = err as { code: string; message: string }
      if (e.code === 'unauthorized') {
        return new NotionError('Invalid Notion token. Check your integration token.', e.code)
      }
      if (e.code === 'object_not_found') {
        return new NotionError('Page not found. Make sure the integration has access to it.', e.code)
      }
      if (e.code === 'rate_limited') {
        return new NotionError('Notion rate limit hit. Please try again in a moment.', e.code)
      }
      return new NotionError(e.message ?? 'Unknown Notion API error', e.code)
    }

    if (err instanceof Error) {
      return new NotionError(err.message)
    }

    return new NotionError('An unexpected error occurred')
  }
}

// Extracts all rich text arrays from a block (covers paragraph, headings, bullets, etc.)
type RichTextItem = { type: string; mention: { type: string; page: { id: string } } }

function getRichTexts(block: BlockObjectResponse): RichTextItem[] {
  const b = block as unknown as Record<string, { rich_text?: RichTextItem[] }>
  const inner = b[block.type]
  if (inner && Array.isArray(inner.rich_text)) return inner.rich_text as RichTextItem[]
  return []
}
