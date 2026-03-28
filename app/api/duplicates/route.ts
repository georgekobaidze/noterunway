import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { NotionClient } from '@/lib/notion/NotionClient'
import { getModelWithKey, MODEL_META, DEFAULT_MODEL } from '@/lib/models'
import type { ModelId } from '@/lib/models'

function getNotionToken(req: NextRequest): string | null {
  return req.cookies.get('notion_token')?.value ?? null
}

const SYSTEM_PROMPT = `You are a Notion workspace analyst. Your job is to find duplicate or near-duplicate pages.

Two pages are duplicates if they are about the same thing — based on the combination of title AND content. Consider all of these as duplicates:
- Same title, same or similar content (obvious copy)
- Same title, different content (one may be an older version)
- Different titles, same or highly similar content (e.g. renamed copy)
- Similar titles that are clearly the same topic (e.g. "Q1 Goals" and "Goals Q1")

Do NOT flag as duplicates:
- Pages with the same broad theme but clearly different specific content
- A parent page that merely links to or mentions its child pages as a table of contents or index — having a mention of a page is not the same as duplicating its content
- A template and a filled-in version of it
- Pages that happen to share a single common word

Hierarchy rule: Each page entry includes a "Parent:" field. If page A is the parent of page B (i.e. page B's "Parent:" is page A's title), you may still group them IF page A contains original text content that substantially overlaps with page B's content. But if page A only mentions/links to page B without repeating its content, do NOT group them.

For each group of duplicates you find:
- Include ALL versions in "pages" (can be 2 or more)
- Set "suggestedKeepId" to the most complete/recently edited version
- Set "similarity" between 0.60 and 1.0 based on how similar they are
- Write a brief "reason" explaining why they are duplicates

Only include groups where you are at least 60% confident. When in doubt, err on the side of inclusion — the user will review your suggestions.`

const duplicatesSchema = z.object({
  reasoning: z.string().describe('Brief summary of what you found across all pages'),
  groups: z.array(
    z.object({
      pages: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
        })
      ).describe('Must contain at least 2 pages'),
      suggestedKeepId: z.string().describe('ID of the best version to keep'),
      similarity: z.number().describe('Similarity score between 0.60 and 1.0'),
      reason: z.string().describe('One sentence explaining why these are duplicates'),
    })
  ),
})

// GET /api/duplicates
// Fetches all pages with title + content snippet, runs AI semantic duplicate detection.
export async function GET(req: NextRequest) {
  const token = getNotionToken(req)
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const aiKey = req.headers.get('x-ai-key')
  const requestedModel = req.headers.get('x-ai-model')
  const modelId: ModelId = (requestedModel && MODEL_META.some((m) => m.id === requestedModel))
    ? requestedModel as ModelId
    : DEFAULT_MODEL
  if (!aiKey) {
    return NextResponse.json({ error: 'missing_ai_key' }, { status: 400 })
  }

  try {
    const notion = new NotionClient(token)
    const allPages = await notion.getAllPages()

    // Extract titles for every page using type-based lookup (works for any database schema).
    // Every Notion page has exactly one property of type 'title', regardless of its display name.
    type PageMeta = { id: string; title: string; lastEdited: string; parentId: string | null }
    const allMeta: PageMeta[] = allPages.map((p) => {
      const titleEntry = Object.values(p.properties).find((prop) => prop.type === 'title')
      const title =
        titleEntry?.type === 'title'
          ? titleEntry.title.map((t: { plain_text: string }) => t.plain_text).join('').trim()
          : ''
      const parentId = p.parent.type === 'page_id' ? p.parent.page_id : null
      return { id: p.id, title, lastEdited: p.last_edited_time, parentId }
    })

    // Build a quick id→title lookup for parent labels in the prompt
    const titleById = new Map(allMeta.map((p) => [p.id, p.title || '(no title)']))

    // Exclude the NoteRunway Archive root and all its descendants from duplicate scanning.
    // Walking up the parent chain (max 10 hops) handles deeply nested archive sub-pages.
    const parentById = new Map(allMeta.map((p) => [p.id, p.parentId]))
    const archiveRootId = allMeta.find((p) => p.title === 'NoteRunway Archive')?.id ?? null

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

    // Fetch content snippets for up to 100 non-archive pages (most recently edited first).
    const candidates = allMeta
      .filter((p) => p.id !== archiveRootId && !isInsideArchive(p.id))
      .slice(0, 100)
    const BATCH = 15
    const pagesWithContent: Array<PageMeta & { contentSnippet: string }> = []

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(async (p) => {
          const { snippet, hasAnyBlocks } = await notion.getPageSnippetWithMeta(p.id, 600)
          // Skip pages with zero blocks — they're truly empty and belong in Garbage Collector.
          // Pages with child_page blocks (folder pages) have hasAnyBlocks=true so they pass through.
          if (!hasAnyBlocks) return null
          return { ...p, contentSnippet: snippet }
        })
      )
      for (const r of results) {
        if (r !== null) pagesWithContent.push(r)
      }
    }

    const skippedEmpty = candidates.length - pagesWithContent.length

    // Build the page list for the AI prompt
    const pageList = pagesWithContent
      .map((p) => {
        const titleLabel = p.title || '(no title)'
        const content = p.contentSnippet || '(empty)'
        const parentLabel = p.parentId
          ? (titleById.get(p.parentId) ?? 'unknown page')
          : 'workspace root'
        return `ID: ${p.id}\nTitle: "${titleLabel}"\nParent: ${parentLabel}\nLast edited: ${p.lastEdited}\nContent: ${content}`
      })
      .join('\n\n---\n\n')

    const userPrompt = `Find all duplicate or near-duplicate pages in this Notion workspace:\n\n${pageList}`

    const model = getModelWithKey(modelId, aiKey)

    const { object } = await generateObject({
      model,
      schema: duplicatesSchema,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    })  

    // Post-process: clamp similarity to [0.6, 1] and filter groups that don't meet the threshold
    const validGroups = object.groups
      .map((g) => ({ ...g, similarity: Math.min(1, Math.max(0.6, g.similarity)) }))
      .filter((g) => g.pages.length >= 2 && g.similarity >= 0.6)

    return NextResponse.json({
      reasoning: object.reasoning,
      groups: validGroups,
      stats: {
        totalPages: allPages.length,
        scannedPages: pagesWithContent.length,
        skippedEmpty: skippedEmpty,
        exactMatchGroups: 0,
        aiGroups: validGroups.length,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/duplicates
// Body: { archiveIds: string[], keepId: string, keepTitle: string, reason: string }
// Archives all confirmed duplicate pages (user-approved action).
export async function POST(req: NextRequest) {
  const token = getNotionToken(req)
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  try {
    const { archivePages, keepTitle, reason } = await req.json()
    if (!Array.isArray(archivePages) || archivePages.length === 0) {
      return NextResponse.json({ error: 'missing_archive_pages' }, { status: 400 })
    }

    const notion = new NotionClient(token)
    const errors: string[] = []

    await Promise.all(
      archivePages.map(async ({ id, title }: { id: string; title?: string }) => {
        try {
          await notion.moveToArchive(id, 'duplicates', {
            title: title || '(untitled)',
            reason: reason ?? 'Identified as duplicate',
            keepTitle,
          })
        } catch (err) {
          errors.push(id)
          console.error(`Failed to archive page ${id}:`, err)
        }
      })
    )

    return NextResponse.json({
      success: true,
      archivedIds: archivePages.filter(({ id }: { id: string }) => !errors.includes(id)).map(({ id }: { id: string }) => id),
      failedIds: errors,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}




