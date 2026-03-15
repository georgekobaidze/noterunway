import { Client, isFullPage } from '@notionhq/client'
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

export type NotionPage = PageObjectResponse

export type ArchiveFeature = 'duplicates' | 'garbage' | 'ask'

export interface ArchiveFolderIds {
  root: string
  duplicates: string
  garbage: string
  ask: string
}

const ARCHIVE_ROOT_TITLE = 'NoteRunway Archive'
const ARCHIVE_FOLDER_TITLES: Record<ArchiveFeature, string> = {
  duplicates: 'Duplicates',
  garbage:    'Garbage Collection',
  ask:        'Semantic Ask',
}

// Cache of all pages per Notion client instance to avoid redundant pagination.
// WeakMap is used so that entries do not prevent garbage collection of client instances.
const allPagesCache: WeakMap<object, NotionPage[]> = new WeakMap()

async function getOrFetchAllPages(
  self: { getAllPages: () => Promise<NotionPage[]> }
): Promise<NotionPage[]> {
  const cached = allPagesCache.get(self)
  if (cached) return cached
  const pages = await self.getAllPages()
  allPagesCache.set(self, pages)
  return pages
}

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

  // Fetch a plain-text snippet from a page's top-level blocks (shallow, fast).
  // Returns at most `maxChars` characters of content, or empty string on failure.
  async getPageTextSnippet(pageId: string, maxChars = 500): Promise<string> {
    try {
      const res = await this.client.blocks.children.list({
        block_id: pageId,
        page_size: 30,
      })
      const texts: string[] = []
      for (const block of res.results) {
        if (!('type' in block)) continue
        const b = block as BlockObjectResponse
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inner = (b as any)[b.type] as { rich_text?: Array<{ plain_text: string }> } | undefined
        if (inner?.rich_text && Array.isArray(inner.rich_text)) {
          const text = inner.rich_text.map((t) => t.plain_text ?? '').join('')
          if (text.trim()) texts.push(text.trim())
        }
      }
      const snippet = texts.join(' ')
      return snippet.length > maxChars ? snippet.slice(0, maxChars) + '…' : snippet
    } catch {
      return ''
    }
  }

  // Like getPageTextSnippet but also returns whether the page has ANY blocks at all
  // (including child_page blocks which have no rich_text).
  // Used to distinguish truly empty pages from folder-style pages.
  async getPageSnippetWithMeta(
    pageId: string,
    maxChars = 500
  ): Promise<{ snippet: string; hasAnyBlocks: boolean }> {
    try {
      const res = await this.client.blocks.children.list({
        block_id: pageId,
        page_size: 30,
      })
      const texts: string[] = []
      for (const block of res.results) {
        if (!('type' in block)) continue
        const b = block as BlockObjectResponse
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inner = (b as any)[b.type] as { rich_text?: Array<{ plain_text: string }> } | undefined
        if (inner?.rich_text && Array.isArray(inner.rich_text)) {
          const text = inner.rich_text.map((t) => t.plain_text ?? '').join('')
          if (text.trim()) texts.push(text.trim())
        }
      }
      const snippet = texts.join(' ')
      return {
        snippet: snippet.length > maxChars ? snippet.slice(0, maxChars) + '…' : snippet,
        hasAnyBlocks: res.results.length > 0,
      }
    } catch {
      return { snippet: '', hasAnyBlocks: false }
    }
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
    const pages = await getOrFetchAllPages(this)
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    const topLevelPages = pages.filter((p) => p.parent.type !== 'page_id').length

    const recentlyEditedPages = pages.filter(
      (p) => new Date(p.last_edited_time).getTime() > sevenDaysAgo
    ).length

    // Duplicate candidate detection: count pages whose normalised title appears more than once
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
    const duplicateCandidates = [...titleCounts.values()].reduce(
      (sum, count) => (count > 1 ? sum + count : sum),
      0
    )

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
    const pages = await getOrFetchAllPages(this)
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

  // ─── Archive folder management ──────────────────────────────────────────────

  // Ensures the NoteRunway Archive folder structure exists in the workspace.
  // Creates root + feature subfolders if any are missing. Safe to call repeatedly.
  async ensureArchiveStructure(): Promise<ArchiveFolderIds> {
    const rootId = await this.findOrCreateWorkspacePage(ARCHIVE_ROOT_TITLE)

    const folderIds = {} as Record<ArchiveFeature, string>
    for (const feature of ['duplicates', 'garbage', 'ask'] as ArchiveFeature[]) {
      folderIds[feature] = await this.findOrCreateChildPage(rootId, ARCHIVE_FOLDER_TITLES[feature])
    }

    return { root: rootId, ...folderIds }
  }

  // Moves a page to the archive folder for the given feature by:
  // 1. Creating an audit stub page in the feature subfolder
  // 2. Archiving (soft-deleting) the original page to Notion Trash
  // NOTE: Notion API does not support re-parenting existing pages, so the
  // stub acts as an audit record while the original goes to Trash.
  async moveToArchive(
    pageId: string,
    feature: ArchiveFeature,
    meta?: { title?: string; reason?: string; keepTitle?: string }
  ): Promise<void> {
    const ids = await this.ensureArchiveStructure()
    const folderId = ids[feature]
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    const stubTitle = meta?.title ?? `Archived page (${pageId})`

    // Fetch original content before archiving so we can preserve it in the stub
    const originalBlocks = await this.fetchCopyableBlocks(pageId)

    // Build body blocks for the stub
    const bodyBlocks: Parameters<typeof this.client.blocks.children.append>[0]['children'] = [
      {
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '🗂️' },
          rich_text: [{ type: 'text', text: { content: `Archived by NoteRunway · ${date}` } }],
          color: 'gray_background',
        },
      },
    ]

    if (meta?.reason) {
      bodyBlocks.push({
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: 'Reason: ' }, annotations: { bold: true } },
            { type: 'text', text: { content: meta.reason } },
          ],
        },
      })
    }

    if (meta?.keepTitle) {
      bodyBlocks.push({
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: 'Kept version: ' }, annotations: { bold: true } },
            { type: 'text', text: { content: meta.keepTitle } },
          ],
        },
      })
    }

    bodyBlocks.push({
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: 'To restore: find the original page in Notion\'s Trash (sidebar → Trash).' },
            annotations: { italic: true, color: 'gray' },
          },
        ],
      },
    })

    // Separator before original content
    if (originalBlocks.length > 0) {
      bodyBlocks.push({ type: 'divider', divider: {} })
      bodyBlocks.push({
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: 'Original Content' } }],
          is_toggleable: false,
          color: 'default',
        },
      })
    }

    // Notion pages.create supports up to 100 children; include first batch inline
    const INLINE_LIMIT = 94 // leave headroom for the meta blocks above
    const inlineBlocks = originalBlocks.slice(0, INLINE_LIMIT)
    const overflowBlocks = originalBlocks.slice(INLINE_LIMIT)

    try {
      const stubPage = await this.client.pages.create({
        parent: { page_id: folderId },
        properties: {
          title: { title: [{ type: 'text', text: { content: stubTitle } }] },
        },
        children: [...bodyBlocks, ...inlineBlocks],
      })

      // Append any blocks beyond the inline limit
      if (overflowBlocks.length > 0) {
        const BATCH = 100
        for (let i = 0; i < overflowBlocks.length; i += BATCH) {
          await this.client.blocks.children.append({
            block_id: stubPage.id,
            children: overflowBlocks.slice(i, i + BATCH),
          })
        }
      }
    } catch {
      // Non-fatal — still archive the original even if stub creation fails
    }

    await this.archivePage(pageId)
  }

  // Fetches a page's blocks and returns them as appendable request objects.
  // Only copies block types whose content can be faithfully reconstructed.
  private async fetchCopyableBlocks(
    pageId: string
  ): Promise<Parameters<typeof this.client.blocks.children.append>[0]['children']> {
    type AppendBlock = Parameters<typeof this.client.blocks.children.append>[0]['children'][number]
    const result: AppendBlock[] = []
    try {
      let cursor: string | undefined
      do {
        const res = await this.client.blocks.children.list({
          block_id: pageId,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        })
        for (const block of res.results) {
          if (!('type' in block)) continue
          const b = block as BlockObjectResponse
          const copied = this.copyBlock(b)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (copied) result.push(copied as any)
        }
        cursor = res.has_more ? res.next_cursor ?? undefined : undefined
      } while (cursor)
    } catch {
      // Best-effort — return whatever we managed to fetch
    }
    return result
  }

  // Converts a BlockObjectResponse into an appendable block request.
  // Returns null for unsupported or non-copyable block types.
  private copyBlock(b: BlockObjectResponse): Record<string, unknown> | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner = (b as any)[b.type]
    if (!inner) return null

    // Block types with rich_text arrays that copy directly
    const richTextTypes = [
      'paragraph', 'heading_1', 'heading_2', 'heading_3',
      'bulleted_list_item', 'numbered_list_item', 'to_do',
      'quote', 'callout', 'toggle', 'code',
    ]
    if (richTextTypes.includes(b.type)) {
      return { type: b.type, [b.type]: { ...inner, children: undefined } }
    }

    if (b.type === 'divider') return { type: 'divider', divider: {} }

    if (b.type === 'image') {
      const url = inner.type === 'external' ? inner.external?.url : inner.file?.url
      if (url) return { type: 'image', image: { type: 'external', external: { url } } }
    }

    if (b.type === 'bookmark') {
      if (inner.url) return { type: 'bookmark', bookmark: { url: inner.url } }
    }

    if (b.type === 'embed') {
      if (inner.url) return { type: 'embed', embed: { url: inner.url } }
    }

    return null
  }

  // Searches for a workspace-level page by exact title. Returns its ID or null.
  private async findWorkspacePageByTitle(title: string): Promise<string | null> {
    try {
      const res = await this.client.search({
        query: title,
        filter: { property: 'object', value: 'page' },
        page_size: 20,
      })
      for (const result of res.results) {
        if (!isFullPage(result)) continue
        const titleProp = result.properties['title'] ?? result.properties['Name']
        const pageTitle =
          titleProp?.type === 'title'
            ? titleProp.title.map((t) => t.plain_text).join('').trim()
            : ''
        if (pageTitle === title) return result.id
      }
      return null
    } catch {
      return null
    }
  }

  // Searches for a child page with the given title inside a parent page.
  private async findChildPageByTitle(parentId: string, title: string): Promise<string | null> {
    try {
      let cursor: string | undefined
      do {
        const res = await this.client.blocks.children.list({
          block_id: parentId,
          start_cursor: cursor,
          page_size: 100,
        })
        for (const block of res.results) {
          if (!('type' in block)) continue
          const b = block as BlockObjectResponse
          if (b.type === 'child_page') {
            const cp = b as unknown as { child_page: { title: string } }
            if (cp.child_page.title === title) return b.id
          }
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
      } while (cursor)
      return null
    } catch {
      return null
    }
  }

  // Finds a workspace-level page by title, creating it if it doesn't exist.
  private async findOrCreateWorkspacePage(title: string): Promise<string> {
    const existing = await this.findWorkspacePageByTitle(title)
    if (existing) return existing

    try {
      const page = await this.client.pages.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parent: { workspace: true } as any,
        properties: {
          title: { title: [{ type: 'text', text: { content: title } }] },
        },
      })
      return page.id
    } catch (err) {
      throw this.handleError(err)
    }
  }

  // Finds a child page by title inside a parent, creating it if it doesn't exist.
  private async findOrCreateChildPage(parentId: string, title: string): Promise<string> {
    const existing = await this.findChildPageByTitle(parentId, title)
    if (existing) return existing

    try {
      const page = await this.client.pages.create({
        parent: { page_id: parentId },
        properties: {
          title: { title: [{ type: 'text', text: { content: title } }] },
        },
      })
      return page.id
    } catch (err) {
      throw this.handleError(err)
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

// Extracts all rich text arrays from a block (covers paragraph, headings, bullets, etc.)
type RichTextItem = { type: string; mention: { type: string; page: { id: string } } }

function getRichTexts(block: BlockObjectResponse): RichTextItem[] {
  const b = block as unknown as Record<string, { rich_text?: RichTextItem[] }>
  const inner = b[block.type]
  if (inner && Array.isArray(inner.rich_text)) return inner.rich_text as RichTextItem[]
  return []
}
