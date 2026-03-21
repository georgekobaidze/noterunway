import { generateObject } from 'ai'
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'
import { getModelWithKey, MODEL_META, DEFAULT_MODEL, type ModelId } from '@/lib/models'

// ─── Request / Action types ───────────────────────────────────────────────────

const ExecuteActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('archive'), pageId: z.string(), pageTitle: z.string() }),
  z.object({ type: z.literal('create'), title: z.string(), content: z.string(), parentPageId: z.string() }),
])

const AskRequestSchema = z.object({
  command: z.string().min(1),
  phase: z.enum(['plan', 'execute']),
  executeActions: z.array(ExecuteActionSchema).optional(),
})

type AskRequest = z.infer<typeof AskRequestSchema>

// ─── Zod schema for AI output ─────────────────────────────────────────────────

const AskResultSchema = z.object({
  mode: z.enum(['search', 'report', 'template', 'refactor', 'summarize', 'archive', 'chat']),
  message: z.string().describe('Main response in markdown. Always populated.'),
  // search
  resultPageIds: z.array(z.string()).optional(),
  // template
  templateTitle: z.string().optional(),
  templateContent: z.string().optional(),
  templateParentTitle: z.string().optional(),
  // refactor
  targetPageId: z.string().optional(),
  targetPageTitle: z.string().optional(),
  // summarize
  summarizedPageIds: z.array(z.string()).optional(),
  // archive
  archiveCandidates: z.array(z.object({
    pageId: z.string(),
    pageTitle: z.string(),
    reason: z.string(),
  })).optional(),
})

const RefactorSchema = z.object({
  refactoredContent: z.string().describe('Full rewritten page content as markdown'),
  reasoning: z.string(),
})

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are NoteRunway's AI assistant for Notion workspace management.

The user gives a command and you receive their workspace page list (title + ID).
Classify their intent and return a structured response.

MODES:
- search: Find pages matching keywords or criteria from the workspace
- report: Generate a workspace health/insight analysis. Write a full markdown report in the message field.
- template: Create a new well-structured Notion page. Populate templateTitle + templateContent (rich markdown with headers, bullets, tables).
- refactor: Rewrite/restructure an existing page. Identify targetPageId from the page list.
- summarize: Summarize the content of specific page(s). Identify summarizedPageIds.
- archive: Identify pages to archive. Only suggest archiving when user explicitly asks or it's clearly appropriate.
- chat: General response when command doesn't fit other modes.

RULES:
- Always populate the message field
- For template mode: write rich, detailed content with headers, bullet points, tables as appropriate
- For search: return only IDs of genuinely matching pages
- Be honest when pages are not found or request can't be fulfilled
- For refactor/summarize: identify the best matching page from the list`

// ─── Helper ───────────────────────────────────────────────────────────────────

function getTitle(page: { properties: Record<string, { type: string; title?: Array<{ plain_text: string }> }> }): string {
  const titleEntry = Object.values(page.properties).find((p) => p.type === 'title')
  return titleEntry?.type === 'title'
    ? titleEntry.title?.map((t) => t.plain_text).join('').trim() ?? ''
    : ''
}

// ─── POST /api/ask ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.cookies.get('notion_token')?.value ?? null
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const aiKey = req.headers.get('x-ai-key')
  if (!aiKey) {
    return NextResponse.json({ error: 'missing_ai_key' }, { status: 400 })
  }

  const requestedModel = req.headers.get('x-ai-model')
  const modelId: ModelId = (requestedModel && MODEL_META.some((m) => m.id === requestedModel))
    ? requestedModel as ModelId
    : DEFAULT_MODEL

  try {
    const raw = await req.json().catch(() => null)
    const parsed = AskRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { command, phase, executeActions } = parsed.data

    const notion = new NotionClient(token)

    // ── Execute phase ──────────────────────────────────────────────────────────

    if (phase === 'execute') {
      const results: string[] = []
      for (const action of (executeActions ?? [])) {
        if (action.type === 'archive') {
          await notion.archivePage(action.pageId)
          results.push(`Archived: ${action.pageTitle}`)
        } else if (action.type === 'create') {
          const pageId = await notion.createPage(action.title, action.content, action.parentPageId)
          results.push(`Created page: ${action.title} (${pageId})`)
        }
      }
      return NextResponse.json({ success: true, results })
    }

    // ── Plan phase ─────────────────────────────────────────────────────────────

    const allPages = await notion.getAllPages()
    const model = getModelWithKey(modelId, aiKey)

    // Compact page list, capped at 200 to stay within context
    type PageMeta = { id: string; title: string }
    const pageMetas: PageMeta[] = allPages.slice(0, 200).map((p) => ({
      id: p.id,
      title: getTitle(p) || '(untitled)',
    }))

    const pageList = pageMetas.map((p) => `- ${p.title} (${p.id})`).join('\n')
    const userPrompt = `User command: "${command}"\n\nWorkspace pages:\n${pageList}`

    const { object: result } = await generateObject({
      model,
      schema: AskResultSchema,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    })

    // If refactor mode: fetch original text + generate rewritten content
    let originalText = ''
    let refactoredContent: string | undefined

    if (result.mode === 'refactor' && result.targetPageId) {
      originalText = await notion.getPageText(result.targetPageId)

      const { object: refactorResult } = await generateObject({
        model,
        schema: RefactorSchema,
        messages: [
          {
            role: 'system',
            content: 'You are rewriting a Notion page to be cleaner, more structured, and easier to read. Preserve all key information.',
          },
          {
            role: 'user',
            content: `Rewrite this page. Original title: "${result.targetPageTitle}"\n\nOriginal content:\n${originalText}`,
          },
        ],
        temperature: 0.3,
      })

      refactoredContent = refactorResult.refactoredContent
    }

    return NextResponse.json({
      ...result,
      ...(refactoredContent !== undefined ? { refactoredContent } : {}),
      pages: pageMetas,
      originalText,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
