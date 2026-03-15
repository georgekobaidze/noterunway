import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { NotionClient } from '@/lib/notion/NotionClient'
import { getModelWithKey } from '@/lib/models'
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
- A parent overview page and a detailed sub-page
- A template and a filled-in version of it
- Pages that happen to share a single common word

For each group of duplicates you find:
- Include ALL versions in "pages" (can be 2 or more)
- Set "suggestedKeepId" to the most complete/recently edited version
- Set "similarity" between 0.75 and 1.0 based on how similar they are
- Write a brief "reason" explaining why they are duplicates

Only include groups where you are at least 75% confident. When in doubt, leave it out — false positives are disruptive.`

const duplicatesSchema = z.object({
  reasoning: z.string().describe('Brief summary of what you found across all pages'),
  groups: z.array(
    z.object({
      pages: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
        })
      ).min(2),
      suggestedKeepId: z.string().describe('ID of the best version to keep'),
      similarity: z.number().min(0).max(1),
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
  const modelId = (req.headers.get('x-ai-model') ?? 'gpt-4o-mini') as ModelId
  if (!aiKey) {
    return NextResponse.json({ error: 'missing_ai_key' }, { status: 400 })
  }

  try {
    const notion = new NotionClient(token)
    const allPages = await notion.getAllPages()

    // Extract titles for every page using type-based lookup (works for any database schema).
    // Every Notion page has exactly one property of type 'title', regardless of its display name.
    type PageMeta = { id: string; title: string; lastEdited: string }
    const allMeta: PageMeta[] = allPages.map((p) => {
      const titleEntry = Object.values(p.properties).find((prop) => prop.type === 'title')
      const title =
        titleEntry?.type === 'title'
          ? titleEntry.title.map((t: { plain_text: string }) => t.plain_text).join('').trim()
          : ''
      return { id: p.id, title, lastEdited: p.last_edited_time }
    })

    // Fetch content snippets for up to 100 pages (most recently edited first).
    const candidates = allMeta.slice(0, 100)
    const BATCH = 15
    const pagesWithContent: Array<PageMeta & { contentSnippet: string }> = []

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(async (p) => ({
          ...p,
          contentSnippet: await notion.getPageTextSnippet(p.id, 400),
        }))
      )
      pagesWithContent.push(...results)
    }

    // Build the page list for the AI prompt
    const pageList = pagesWithContent
      .map((p) => {
        const titleLabel = p.title || '(no title)'
        const content = p.contentSnippet || '(empty)'
        return `ID: ${p.id}\nTitle: "${titleLabel}"\nLast edited: ${p.lastEdited}\nContent: ${content}`
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

    return NextResponse.json({
      reasoning: object.reasoning,
      groups: object.groups,
      stats: {
        totalPages: allPages.length,
        scannedPages: pagesWithContent.length,
        exactMatchGroups: 0,
        aiGroups: object.groups.length,
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
    const { archiveIds, keepTitle, reason } = await req.json()
    if (!Array.isArray(archiveIds) || archiveIds.length === 0) {
      return NextResponse.json({ error: 'missing_archive_ids' }, { status: 400 })
    }

    const notion = new NotionClient(token)
    const errors: string[] = []

    await Promise.all(
      archiveIds.map(async (id: string) => {
        try {
          await notion.moveToArchive(id, 'duplicates', {
            title: id,
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
      archivedIds: archiveIds.filter((id: string) => !errors.includes(id)),
      failedIds: errors,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}




