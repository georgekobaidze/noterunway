import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MCPClient } from '@/lib/mcp/MCPClient'
import { NotionClient } from '@/lib/notion/NotionClient'

// ─── Schema ───────────────────────────────────────────────────────────────────

const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('archive'),
    pageId: z.string(),
    pageTitle: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('create'),
    parentPageId: z.string(),
    title: z.string(),
    content: z.string(),
  }),
  z.object({
    type: z.literal('update'),
    pageId: z.string(),
    pageTitle: z.string(),
    content: z.string(),
  }),
])

const ExecuteRequestSchema = z.object({
  actions: z.array(ActionSchema).min(1).max(50),
})

// ─── POST /api/ask/execute ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.cookies.get('notion_token')?.value ?? null
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = ExecuteRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { actions } = parsed.data
  const results: string[] = []
  const failedActions: string[] = []

  // Archive actions use NotionClient.moveToArchive() — creates an audit stub in
  // "NoteRunway Archive / Ask" AND sends the original to Notion Trash, matching
  // the behaviour of every other NoteRunway feature.
  const notion = new NotionClient(token)

  // Create/update actions use MCPClient so writes go through the MCP layer.
  const mcpClient = new MCPClient(token)

  try {
    // Only connect MCP if there are non-archive actions
    const needsMcp = actions.some((a) => a.type !== 'archive')
    if (needsMcp) await mcpClient.connect()

    for (const action of actions) {
      if (action.type === 'archive') {
        try {
          await notion.moveToArchive(action.pageId, 'ask', {
            title: action.pageTitle,
            reason: action.reason,
          })
          results.push(`Archived: ${action.pageTitle}`)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          failedActions.push(`archive "${action.pageTitle}": ${message}`)
        }
      } else if (action.type === 'create') {
        const r = await mcpClient.executeTool({
          tool: 'API-post-page',
          parameters: {
            parent: { page_id: action.parentPageId },
            properties: {
              title: {
                title: [{ type: 'text', text: { content: action.title } }],
              },
            },
          },
          approved: true,
        })
        if (r.success) results.push(`Created: ${action.title}`)
        else failedActions.push(`create "${action.title}": ${r.error ?? 'Unknown error'}`)
      } else if (action.type === 'update') {
        const r = await mcpClient.executeTool({
          tool: 'API-patch-block-children',
          parameters: {
            block_id: action.pageId,
            children: [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ type: 'text', text: { content: action.content } }],
                },
              },
            ],
          },
          approved: true,
        })
        if (r.success) results.push(`Updated: ${action.pageTitle}`)
        else failedActions.push(`update "${action.pageTitle}": ${r.error ?? 'Unknown error'}`)
      }
    }
  } finally {
    await mcpClient.disconnect()
  }

  return NextResponse.json({ success: true, results, failedActions })
}
