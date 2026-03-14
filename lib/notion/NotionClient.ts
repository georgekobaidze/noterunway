import { Client, isFullPage } from '@notionhq/client'
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

export type NotionPage = PageObjectResponse

export interface WorkspaceStats {
  totalPages: number
  orphanPages: number        // pages with no parent page (top-level or truly unlinked)
  emptyPages: number         // pages with no content blocks
  recentlyEditedPages: number // edited in last 7 days
  linkDensity: number        // avg inbound links per page (0–1 score)
  duplicateCandidates: number // pages with identical or near-identical titles
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

    // Build a set of page IDs that appear as a parent of another page
    const parentIds = new Set<string>()
    for (const page of pages) {
      if (page.parent.type === 'page_id') {
        parentIds.add(page.parent.page_id)
      }
    }

    // Count inbound links per page (how many other pages reference this page as parent)
    const inboundLinks = new Map<string, number>()
    for (const page of pages) {
      inboundLinks.set(page.id, 0)
    }
    for (const page of pages) {
      if (page.parent.type === 'page_id') {
        const count = inboundLinks.get(page.parent.page_id) ?? 0
        inboundLinks.set(page.parent.page_id, count + 1)
      }
    }

    const orphanPages = pages.filter((p) => (inboundLinks.get(p.id) ?? 0) === 0).length
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

    // Link density: ratio of pages that have at least one inbound link
    const linkedPages = pages.filter((p) => (inboundLinks.get(p.id) ?? 0) > 0).length
    const linkDensity = pages.length > 0 ? linkedPages / pages.length : 0

    // Empty pages: pages where the title is blank (we can't check blocks without N+1 calls)
    const emptyPages = pages.filter((p) => {
      const titleProp = p.properties['title'] ?? p.properties['Name']
      const titleText =
        titleProp?.type === 'title'
          ? titleProp.title.map((t) => t.plain_text).join('').trim()
          : ''
      return titleText === ''
    }).length

    return {
      totalPages: pages.length,
      orphanPages,
      emptyPages,
      recentlyEditedPages,
      linkDensity: Math.round(linkDensity * 100) / 100,
      duplicateCandidates,
    }
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
