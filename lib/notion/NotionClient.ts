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

export interface GarbagePage {
  id: string
  title: string
  lastEdited: string
  parentId: string | null
  category: 'empty' | 'stale' | 'orphaned'
}

export interface GarbageScanResult {
  empty: GarbagePage[]
  stale: GarbagePage[]
  orphaned: GarbagePage[]
  stats: {
    totalPages: number
    scannedPages: number
    archiveExcluded: number
  }
}

export interface DeadLink {
  sourcePageId: string
  sourcePageTitle: string
  brokenTargetId: string
  brokenTargetTitle: string | null  // null if the page is hard-deleted and unresolvable
}

export interface DeadLinkScanResult {
  deadLinks: DeadLink[]
  stats: {
    totalPages: number
    scannedPages: number
    archiveExcluded: number
    deadLinkCount: number
  }
}

export type SensitiveCategory = 'api_key' | 'credential' | 'pii' | 'crypto'

export interface SensitiveFinding {
  sourcePageId: string
  sourcePageTitle: string
  patternName: string
  category: SensitiveCategory
  redactedSnippet: string  // e.g. "sk-proj-T3Bl...wxyz" — enough to confirm, not expose
}

export interface SensitiveScanResult {
  findings: SensitiveFinding[]        // regex-detected findings
  aiFindings: SensitiveFinding[]      // AI-detected findings not caught by regex
  stats: {
    totalPages: number
    scannedPages: number
    archiveExcluded: number
    findingCount: number
    aiFindingCount: number
  }
}

export interface GraphNode {
  id: string
  title: string
  depth: number        // 0 = root, 1 = child of root, etc.
  isOrphan: boolean    // no parent and no inbound mention edges
  parentId: string | null
  childCount: number
  mentionCount: number // number of @mention edges pointing TO this node
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: 'parent' | 'mention'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: {
    totalPages: number
    archiveExcluded: number
    orphanCount: number
    edgeCount: number
  }
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

  // Fetch a plain-text snippet and metadata from a page's top-level blocks (shallow, fast).
  // Returns at most `maxChars` characters of content in `snippet`, plus `hasAnyBlocks`
  // indicating whether ANY blocks exist. `hasAnyBlocks` distinguishes truly empty pages
  // from folder-style pages where child_page blocks have no rich_text but still count
  // as content.
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
      // Notion API doesn't support archived:true for workspace-level pages.
      // Fall back to in_trash which works for all pages.
      const msg = err instanceof Error ? err.message : ''
      if (msg.toLowerCase().includes('workspace level')) {
        try {
          await this.client.pages.update({
            page_id: pageId,
            in_trash: true,
          } as Parameters<typeof this.client.pages.update>[0])
          return
        } catch {
          // ignore fallback error, throw original
        }
      }
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
                  if (rt.type === 'mention' && rt.mention?.type === 'page') {
                    const id = rt.mention.page?.id
                    if (id && pageIds.has(id)) mentionedIds.add(id)
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

  // Scan all pages for @mentions pointing to pages that no longer exist in the workspace.
  // A mention is "dead" if its target page ID is not in the workspace page list.
  // Archive pages are excluded from scanning (they're expected to have broken links).
  async getDeadLinks(): Promise<DeadLinkScanResult> {
    const pages = await getOrFetchAllPages(this)
    const pageIds = new Set(pages.map((p) => p.id))

    function getTitle(page: NotionPage): string {
      const titleEntry = Object.values(page.properties).find((prop) => prop.type === 'title')
      return titleEntry?.type === 'title'
        ? titleEntry.title.map((t: { plain_text: string }) => t.plain_text).join('').trim()
        : ''
    }

    const archiveRootId = pages.find((p) => getTitle(p) === ARCHIVE_ROOT_TITLE)?.id ?? null
    const parentById = new Map(
      pages.map((p) => [p.id, p.parent.type === 'page_id' ? p.parent.page_id : null])
    )

    function isInsideArchive(id: string): boolean {
      if (!archiveRootId) return false
      const visited = new Set<string>()
      let current: string | null = id
      while (current) {
        if (visited.has(current)) return false
        visited.add(current)
        const pid: string | null = parentById.get(current) ?? null
        if (pid === archiveRootId) return true
        current = pid
      }
      return false
    }

    const candidates = pages.filter((p) => p.id !== archiveRootId && !isInsideArchive(p.id))
    const archiveExcluded = pages.length - candidates.length

    const deadLinks: DeadLink[] = []
    const BATCH = 10

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH)
      const seenDeadLinkPairs = new Set<string>()
      await Promise.all(
        batch.map(async (page) => {
          const sourceTitle = getTitle(page)
          try {
            let cursor: string | undefined
            do {
              const res = await this.client.blocks.children.list({
                block_id: page.id,
                start_cursor: cursor,
                page_size: 100,
              })
              for (const block of res.results) {
                if (!('type' in block)) continue
                const richTexts = getRichTexts(block as BlockObjectResponse)
                for (const rt of richTexts) {
                  if (rt.type === 'mention' && rt.mention?.type === 'page') {
                    const targetId = rt.mention.page?.id
                    if (!targetId || pageIds.has(targetId)) continue
                    // Only add once per source→target pair
                    const pairKey = `${page.id}:${targetId}`
                    if (!seenDeadLinkPairs.has(pairKey)) {
                      seenDeadLinkPairs.add(pairKey)
                      deadLinks.push({
                        sourcePageId: page.id,
                        sourcePageTitle: sourceTitle,
                        brokenTargetId: targetId,
                        brokenTargetTitle: null,
                      })
                    }
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

    // Attempt to resolve titles for broken targets — archived pages are still fetchable.
    // Hard-deleted pages return 404 and stay null.
    const uniqueTargetIds = [...new Set(deadLinks.map((dl) => dl.brokenTargetId))]
    const resolvedTitles = new Map<string, string | null>()
    // Batch requests to avoid unbounded concurrency and hitting Notion rate limits.
    for (let i = 0; i < uniqueTargetIds.length; i += BATCH) {
      const batch = uniqueTargetIds.slice(i, i + BATCH)
      await Promise.all(
        batch.map(async (targetId) => {
          try {
            const page = await this.client.pages.retrieve({ page_id: targetId })
            if (isFullPage(page)) {
              resolvedTitles.set(targetId, getTitle(page) || '(untitled)')
            } else {
              resolvedTitles.set(targetId, null)
            }
          } catch {
            resolvedTitles.set(targetId, null)
          }
        })
      )
    }

    for (const dl of deadLinks) {
      dl.brokenTargetTitle = resolvedTitles.get(dl.brokenTargetId) ?? null
    }

    return {
      deadLinks,
      stats: {
        totalPages: pages.length,
        scannedPages: candidates.length,
        archiveExcluded,
        deadLinkCount: deadLinks.length,
      },
    }
  }

  // Scan all workspace pages for sensitive data patterns (API keys, tokens, PII, etc.).
  // Uses full recursive block traversal so toggles, callouts, and nested content are covered.
  // Archive pages are excluded. Matches are redacted — only first 8 + last 4 chars shown.
  async getSensitiveFindings(): Promise<SensitiveScanResult> {
    const pages = await getOrFetchAllPages(this)

    // Build parent and page lookup maps
    const parentById = new Map<string, string | null>()
    const pageById = new Map<string, (typeof pages)[number]>()
    for (const page of pages) {
      const p = page.parent
      const parentId =
        p.type === 'page_id' ? p.page_id
        : p.type === 'database_id' ? p.database_id
        : null
      parentById.set(page.id, parentId)
      pageById.set(page.id, page)
    }

    const titleOf = (page: (typeof pages)[number]): string => {
      const raw = Object.values(page.properties).find((prop) => prop.type === 'title') as any
      return raw?.title?.map((t: any) => t.plain_text).join('') || '(untitled)'
    }

    // Precompute archive root page IDs so we don't repeatedly parse titles
    const archiveRootIds = new Set<string>()
    for (const page of pages) {
      if (titleOf(page) === ARCHIVE_ROOT_TITLE) {
        archiveRootIds.add(page.id)
      }
    }

    const isInsideArchive = (pageId: string): boolean => {
      const visited = new Set<string>()
      let current: string | null = pageId
      while (current) {
        if (visited.has(current)) break
        visited.add(current)
        if (archiveRootIds.has(current)) return true
        const pg = pageById.get(current)
        if (!pg) break
        current = parentById.get(current) ?? null
      }
      return false
    }

    const candidates = pages.filter((p) => !isInsideArchive(p.id))
    const archiveExcluded = pages.length - candidates.length

    const findings: SensitiveFinding[] = []

    for (const page of candidates) {
      const pageTitle = titleOf(page)
      let blocks: BlockObjectResponse[]
      try {
        blocks = await this.getPageBlocks(page.id)
      } catch {
        continue
      }

      for (const block of blocks) {
        const richTexts = getRichTexts(block)
        for (const rt of richTexts) {
          if (rt.type !== 'text' || !rt.text) continue
          const text = rt.text.content
          for (const pattern of SENSITIVE_PATTERNS) {
            // Ensure global regexes do not carry state across texts
            pattern.regex.lastIndex = 0
            let match: RegExpExecArray | null
            while ((match = pattern.regex.exec(text)) !== null) {
              const raw = match[0]
              const redacted =
                raw.length > 12
                  ? `${raw.slice(0, 8)}...${raw.slice(-4)}`
                  : `${raw.slice(0, 4)}...`
              const alreadyAdded = findings.some(
                (f) =>
                  f.sourcePageId === page.id &&
                  f.patternName === pattern.name &&
                  f.redactedSnippet === redacted
              )
              if (!alreadyAdded) {
                findings.push({
                  sourcePageId: page.id,
                  sourcePageTitle: pageTitle,
                  patternName: pattern.name,
                  category: pattern.category,
                  redactedSnippet: redacted,
                })
              }
            }
          }
        }
      }
    }

    return {
      findings,
      aiFindings: [],
      stats: {
        totalPages: pages.length,
        scannedPages: candidates.length,
        archiveExcluded,
        findingCount: findings.length,
        aiFindingCount: 0,
      },
    }
  }

  // Returns all non-archived pages with their full text content concatenated.
  // Used by the deep AI scan to send page text to an LLM.
  async getAllPagesWithText(): Promise<Array<{ pageId: string; pageTitle: string; text: string }>> {
    const pages = await getOrFetchAllPages(this)

    const parentById = new Map<string, string | null>()
    for (const page of pages) {
      const p = page.parent
      const parentId =
        p.type === 'page_id' ? p.page_id
        : p.type === 'database_id' ? p.database_id
        : null
      parentById.set(page.id, parentId)
    }

    const titleOf = (page: (typeof pages)[number]): string => {
      const raw = Object.values(page.properties).find((prop) => prop.type === 'title') as any
      return raw?.title?.map((t: any) => t.plain_text).join('') || '(untitled)'
    }

    const isInsideArchive = (pageId: string): boolean => {
      const visited = new Set<string>()
      let current: string | null = pageId
      while (current) {
        if (visited.has(current)) break
        visited.add(current)
        const pg = pages.find((p) => p.id === current)
        if (!pg) break
        if (titleOf(pg) === ARCHIVE_ROOT_TITLE) return true
        current = parentById.get(current) ?? null
      }
      return false
    }

    const candidates = pages.filter((p) => !isInsideArchive(p.id))
    const result: Array<{ pageId: string; pageTitle: string; text: string }> = []

    for (const page of candidates) {
      let blocks: BlockObjectResponse[]
      try {
        blocks = await this.getPageBlocks(page.id)
      } catch {
        continue
      }

      const textParts: string[] = []
      for (const block of blocks) {
        const richTexts = getRichTexts(block)
        for (const rt of richTexts) {
          if (rt.type === 'text' && rt.text) {
            textParts.push(rt.text.content)
          }
        }
      }

      result.push({
        pageId: page.id,
        pageTitle: titleOf(page),
        text: textParts.join(' '),
      })
    }

    return result
  }

  // Build graph data: nodes (pages) + edges (parent/child + @mention links).
  // Archive pages are excluded. Scans top-level blocks only for @mentions (fast pass).
  async getGraphData(): Promise<GraphData> {
    const pages = await getOrFetchAllPages(this)

    const parentById = new Map<string, string | null>()
    const pageById = new Map<string, (typeof pages)[number]>()
    for (const page of pages) {
      const p = page.parent
      const parentId =
        p.type === 'page_id' ? p.page_id
        : p.type === 'database_id' ? p.database_id
        : null
      parentById.set(page.id, parentId)
      pageById.set(page.id, page)
    }

    const titleOf = (page: (typeof pages)[number]): string => {
      const raw = Object.values(page.properties).find((prop) => prop.type === 'title') as any
      return raw?.title?.map((t: any) => t.plain_text).join('') || '(untitled)'
    }

    const archiveRootIds = new Set<string>()
    for (const page of pages) {
      if (titleOf(page) === ARCHIVE_ROOT_TITLE) archiveRootIds.add(page.id)
    }

    const isInsideArchive = (pageId: string): boolean => {
      const visited = new Set<string>()
      let current: string | null = pageId
      while (current) {
        if (visited.has(current)) break
        visited.add(current)
        if (archiveRootIds.has(current)) return true
        const pg = pageById.get(current)
        if (!pg) break
        current = parentById.get(current) ?? null
      }
      return false
    }

    const candidates = pages.filter((p) => !isInsideArchive(p.id))
    const candidateIds = new Set(candidates.map((p) => p.id))
    const archiveExcluded = pages.length - candidates.length

    // Compute depth for each node
    const depthOf = (pageId: string): number => {
      let depth = 0
      const visited = new Set<string>()
      let current: string | null = parentById.get(pageId) ?? null
      while (current && candidateIds.has(current)) {
        if (visited.has(current)) break
        visited.add(current)
        depth++
        current = parentById.get(current) ?? null
      }
      return depth
    }

    // Build parent/child edges
    const edges: GraphEdge[] = []
    for (const page of candidates) {
      const pid = parentById.get(page.id) ?? null
      if (pid && candidateIds.has(pid)) {
        edges.push({ id: `parent:${pid}→${page.id}`, source: pid, target: page.id, type: 'parent' })
      }
    }

    // Scan top-level blocks for @mention edges (fast, no recursion needed for graph)
    const mentionTargetCount = new Map<string, number>()
    const BATCH = 10
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH)
      await Promise.all(batch.map(async (page) => {
        try {
          let cursor: string | undefined
          do {
            const res = await this.client.blocks.children.list({ block_id: page.id, start_cursor: cursor, page_size: 100 })
            for (const block of res.results) {
              if (!('type' in block)) continue
              const richTexts = getRichTexts(block as BlockObjectResponse)
              for (const rt of richTexts) {
                if (rt.type === 'mention' && rt.mention?.type === 'page') {
                  const targetId = rt.mention.page?.id
                  if (!targetId || !candidateIds.has(targetId) || targetId === page.id) continue
                  const edgeId = `mention:${page.id}→${targetId}`
                  const isNewEdge = !edges.some((e) => e.id === edgeId)
                  if (isNewEdge) {
                    edges.push({ id: edgeId, source: page.id, target: targetId, type: 'mention' })
                    mentionTargetCount.set(targetId, (mentionTargetCount.get(targetId) ?? 0) + 1)
                  }
                }
              }
            }
            cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
          } while (cursor)
        } catch { /* skip inaccessible pages */ }
      }))
    }

    // Count children per node
    const childCount = new Map<string, number>()
    for (const page of candidates) {
      const pid = parentById.get(page.id) ?? null
      if (pid && candidateIds.has(pid)) {
        childCount.set(pid, (childCount.get(pid) ?? 0) + 1)
      }
    }

    // Determine orphans: no parent in workspace AND no inbound mention edges
    const nodesWithInboundMentions = new Set(edges.filter((e) => e.type === 'mention').map((e) => e.target))
    const nodes: GraphNode[] = candidates.map((page) => {
      const pid = parentById.get(page.id) ?? null
      const hasParentInWorkspace = pid !== null && candidateIds.has(pid)
      const hasInboundMention = nodesWithInboundMentions.has(page.id)
      const depth = depthOf(page.id)
      return {
        id: page.id,
        title: titleOf(page),
        depth,
        // Root pages (depth 0) are intentionally at workspace level — not orphans.
        // A true orphan is a non-root page with no parent in the workspace and no inbound mentions.
        isOrphan: depth > 0 && !hasParentInWorkspace && !hasInboundMention,
        parentId: hasParentInWorkspace ? pid : null,
        childCount: childCount.get(page.id) ?? 0,
        mentionCount: mentionTargetCount.get(page.id) ?? 0,
      }
    })

    const orphanCount = nodes.filter((n) => n.isOrphan).length

    return { nodes, edges, stats: { totalPages: candidates.length, archiveExcluded, orphanCount, edgeCount: edges.length } }
  }

  // Get plain text content of a single page (shallow — top-level blocks only for speed)
  async getPageText(pageId: string): Promise<string> {
    try {
      const blocks = await this.getPageBlocks(pageId)
      const parts: string[] = []
      for (const block of blocks) {
        const rts = getRichTexts(block as BlockObjectResponse)
        const inlineParts: string[] = []
        for (const rt of rts) {
          if (rt.type === 'text' && rt.text) inlineParts.push(rt.text.content)
        }
        if (inlineParts.length > 0) {
          parts.push(inlineParts.join(''))
        }
      }
      return parts.join('\n')
    } catch {
      return ''
    }
  }

  // Create a page with markdown content under a specified parent page
  async createPage(title: string, markdown: string, parentPageId: string): Promise<string> {
    try {
      const children = markdownToNotionBlocks(markdown)
      const page = await this.client.pages.create({
        parent: { page_id: parentPageId },
        properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
        children: children.slice(0, 100) as any,
      })
      return page.id
    } catch (err) {
      throw this.handleError(err)
    }
  }

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

  // Scan the workspace for garbage pages: orphaned, empty, and stale.
  // Categories are mutually exclusive: orphaned > empty > stale (priority order).
  // Archive pages are excluded from all categories.
  async getGarbagePages(staleDays = 90): Promise<GarbageScanResult> {
    const pages = await getOrFetchAllPages(this)
    const allPageIds = new Set(pages.map((p) => p.id))

    function getTitle(page: NotionPage): string {
      const titleEntry = Object.values(page.properties).find((prop) => prop.type === 'title')
      return titleEntry?.type === 'title'
        ? titleEntry.title.map((t: { plain_text: string }) => t.plain_text).join('').trim()
        : ''
    }

    const archiveRootId = pages.find((p) => getTitle(p) === ARCHIVE_ROOT_TITLE)?.id ?? null
    const parentById = new Map(
      pages.map((p) => [p.id, p.parent.type === 'page_id' ? p.parent.page_id : null])
    )

    function isInsideArchive(id: string): boolean {
      if (!archiveRootId) return false
      let current: string | null = id
      const visited = new Set<string>()
      while (current) {
        if (visited.has(current)) {
          // Cycle detected; treat as not inside archive to avoid infinite loops.
          return false
        }
        visited.add(current)
        const pid: string | null = parentById.get(current) ?? null
        if (!pid) return false
        if (pid === archiveRootId) return true
        current = pid
      }
      return false
    }

    const candidates = pages.filter((p) => p.id !== archiveRootId && !isInsideArchive(p.id))
    const archiveExcluded = pages.length - candidates.length

    // Orphaned: has a parent page_id but that page is not in the workspace
    // (parent was deleted or archived out of integration scope)
    const orphanedIds = new Set<string>()
    for (const p of candidates) {
      if (p.parent.type === 'page_id' && !allPageIds.has(p.parent.page_id)) {
        orphanedIds.add(p.id)
      }
    }

    // Empty: zero content blocks (skip orphaned pages — already categorised)
    const nonOrphaned = candidates.filter((p) => !orphanedIds.has(p.id))
    const emptyIds = new Set<string>()
    const BATCH = 10
    for (let i = 0; i < nonOrphaned.length; i += BATCH) {
      const batch = nonOrphaned.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(async (page) => {
          try {
            const res = await this.client.blocks.children.list({ block_id: page.id, page_size: 1 })
            return res.results.length === 0 ? page.id : null
          } catch {
            return null
          }
        })
      )
      for (const id of results) {
        if (id) emptyIds.add(id)
      }
    }

    const staleThreshold = Date.now() - staleDays * 24 * 60 * 60 * 1000

    const empty: GarbagePage[] = []
    const stale: GarbagePage[] = []
    const orphaned: GarbagePage[] = []

    for (const p of candidates) {
      const title = getTitle(p)
      const lastEdited = p.last_edited_time
      const parentId = p.parent.type === 'page_id' ? p.parent.page_id : null

      if (orphanedIds.has(p.id)) {
        orphaned.push({ id: p.id, title, lastEdited, parentId, category: 'orphaned' })
      } else if (emptyIds.has(p.id)) {
        empty.push({ id: p.id, title, lastEdited, parentId, category: 'empty' })
      } else if (new Date(lastEdited).getTime() < staleThreshold) {
        stale.push({ id: p.id, title, lastEdited, parentId, category: 'stale' })
      }
    }

    return {
      empty,
      stale,
      orphaned,
      stats: { totalPages: pages.length, scannedPages: candidates.length, archiveExcluded },
    }
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
  // 1. Recursively archiving any child pages first (so they get their own stubs)
  // 2. Creating an audit stub page in the feature subfolder
  // 3. Archiving (soft-deleting) the original page to Notion Trash
  // NOTE: Notion API does not support re-parenting existing pages, so the
  // stub acts as an audit record while the original goes to Trash.
  async moveToArchive(
    pageId: string,
    feature: ArchiveFeature,
    meta?: { title?: string; reason?: string; keepTitle?: string },
    _depth = 0,
    _parentStubId?: string,  // when set, nest stub inside this page instead of the feature folder
  ): Promise<void> {
    // Top-level calls go into the feature folder; recursive calls nest inside parent stub
    let folderId: string
    if (_parentStubId) {
      folderId = _parentStubId
    } else {
      const ids = await this.ensureArchiveStructure()
      folderId = ids[feature]
    }

    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    const stubTitle = meta?.title ? `${meta.title}` : '(untitled)'

    // Discover child pages before archiving
    const childPageIds: Array<{ id: string; title: string }> = []
    if (_depth < 5) {
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
            if (b.type === 'child_page') {
              const childTitle = b.child_page?.title ?? '(untitled)'
              childPageIds.push({ id: b.id, title: childTitle })
            }
          }
          cursor = res.has_more ? res.next_cursor ?? undefined : undefined
        } while (cursor)
      } catch {
        // Best-effort
      }
    }

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
            text: { content: 'The original content is preserved below. To restore manually, copy the content back into a new page.' },
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

    let stubPageId: string | undefined
    try {
      const stubPage = await this.client.pages.create({
        parent: { page_id: folderId },
        properties: {
          title: { title: [{ type: 'text', text: { content: stubTitle } }] },
        },
        children: [...bodyBlocks, ...inlineBlocks],
      })
      stubPageId = stubPage.id

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

    // Recursively archive child pages nested inside this stub to preserve hierarchy
    if (stubPageId && childPageIds.length > 0) {
      for (const child of childPageIds) {
        try {
          await this.moveToArchive(child.id, feature, { title: child.title }, _depth + 1, stubPageId)
        } catch {
          // Best-effort — don't let child failures block parent archiving
        }
      }
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
        const titleProp = Object.values(result.properties).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (prop: any) => prop && typeof prop === 'object' && prop.type === 'title',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any
        const pageTitle =
          titleProp && Array.isArray(titleProp.title)
            ? titleProp.title.map((t: { plain_text: string }) => t.plain_text).join('').trim()
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
type RichTextItem = {
  type: string
  text?: { content: string; link: { url: string } | null }
  mention?: { type: string; page?: { id: string } }
}

function getRichTexts(block: BlockObjectResponse): RichTextItem[] {
  const b = block as unknown as Record<string, { rich_text?: RichTextItem[] }>
  const inner = b[block.type]
  if (inner && Array.isArray(inner.rich_text)) return inner.rich_text as RichTextItem[]
  return []
}

interface SensitivePattern {
  name: string
  category: SensitiveCategory
  regex: RegExp
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // API Keys
  { name: 'OpenAI API Key',         category: 'api_key',    regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'Anthropic API Key',      category: 'api_key',    regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'xAI / Grok Key',         category: 'api_key',    regex: /xai-[A-Za-z0-9_-]{20,}/g },
  { name: 'Stripe Secret Key',      category: 'api_key',    regex: /sk_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: 'Stripe Publishable Key', category: 'api_key',    regex: /pk_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: 'AWS Access Key ID',      category: 'api_key',    regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token',           category: 'api_key',    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g },
  { name: 'GitHub PAT',             category: 'api_key',    regex: /github_pat_[A-Za-z0-9_]{36,}/g },
  // Crypto / Private Keys
  { name: 'PEM Private Key',        category: 'crypto',     regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'JWT Token',              category: 'crypto',     regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  // Credentials
  { name: 'Database URL',           category: 'credential', regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]{8,}/gi },
  { name: 'Password in Code',       category: 'credential', regex: /(?:password|passwd|secret|api_secret|client_secret)\s*[=:]\s*["']?[^\s"',;]{8,}/gi },
  // PII
  { name: 'Credit Card Number',     category: 'pii',        regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g },
]

// Converts a markdown string to Notion block objects for use with the pages.create API.
export function markdownToNotionBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = []
  for (const line of markdown.split('\n')) {
    if (line.startsWith('# '))
      blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    else if (line.startsWith('## '))
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] } })
    else if (line.startsWith('### '))
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] } })
    else if (line.startsWith('- ') || line.startsWith('* '))
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    else if (/^\d+\. /.test(line))
      blocks.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\. /, '') } }] } })
    else if (line.trim())
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: line } }] } })
  }
  return blocks
}
