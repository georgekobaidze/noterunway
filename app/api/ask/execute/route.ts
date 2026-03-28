import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MCPClient } from '@/lib/mcp/MCPClient'
import { NotionClient, markdownToNotionBlocks } from '@/lib/notion/NotionClient'

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
    content: z.string().default(''),
  }),
  z.object({
    type: z.literal('append'),
    pageId: z.string(),
    pageTitle: z.string(),
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

  const notion = new NotionClient(token)
  const mcpClient = new MCPClient(token)

  try {
    const needsMcp = actions.some((a) => a.type !== 'archive')
    if (needsMcp) {
      await mcpClient.connect()
    }

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
        // Step 1: create the page shell via MCP
        const createR = await mcpClient.executeTool({
          tool: 'API-post-page',
          parameters: {
            parent: action.parentPageId
              ? { page_id: action.parentPageId }
              : { workspace: true },
            properties: {
              title: {
                title: [{ type: 'text', text: { content: action.title } }],
              },
            },
          },
          approved: true,
        })
        if (!createR.success) {
          failedActions.push(`create "${action.title}": ${createR.error ?? 'Unknown error'}`)
          continue
        }

        // Step 2: append content blocks via MCP
        const newPageId = (createR.data as { id?: string } | null)?.id
        if (newPageId && action.content.trim()) {
          const blocks = markdownToNotionBlocks(action.content)
          // Notion API allows at most 100 blocks per append call
          for (let i = 0; i < blocks.length; i += 100) {
            const appendR = await mcpClient.executeTool({
              tool: 'API-patch-block-children',
              parameters: { block_id: newPageId, children: blocks.slice(i, i + 100) },
              approved: true,
            })
            if (!appendR.success) {
              failedActions.push(`add content to "${action.title}": ${appendR.error ?? 'Unknown error'}`)
              break
            }
          }
        }

        results.push(`Created: ${action.title}`)
      } else if (action.type === 'append') {
        // Append content to the end of the page without touching existing blocks
        const blocks = markdownToNotionBlocks(action.content)
        let appendFailed = false
        for (let i = 0; i < blocks.length; i += 100) {
          const appendR = await mcpClient.executeTool({
            tool: 'API-patch-block-children',
            parameters: { block_id: action.pageId, children: blocks.slice(i, i + 100) },
            approved: true,
          })
          if (!appendR.success) {
            failedActions.push(`append to "${action.pageTitle}": ${appendR.error ?? 'Unknown error'}`)
            appendFailed = true
            break
          }
        }
        if (!appendFailed) results.push(`Appended to: ${action.pageTitle}`)
      } else if (action.type === 'update') {
        // Step 1: paginate through ALL existing blocks and delete them
        let cursor: string | undefined
        let fetchFailed = false
        do {
          const params: Record<string, unknown> = { block_id: action.pageId }
          if (cursor) params.start_cursor = cursor

          const existingR = await mcpClient.executeTool({
            tool: 'API-get-block-children',
            parameters: params,
            approved: false,
          })

          if (!existingR.success) {
            fetchFailed = true
            break
          }

          const page = existingR.data as {
            results?: { id: string }[]
            has_more?: boolean
            next_cursor?: string | null
          } | null

          const existing = page?.results ?? []
          for (const block of existing) {
            if (block.id) {
              await mcpClient.executeTool({
                tool: 'API-delete-a-block',
                parameters: { block_id: block.id },
                approved: true,
              })
            }
          }

          cursor = page?.has_more ? page.next_cursor ?? undefined : undefined
        } while (cursor)

        if (fetchFailed) {
          failedActions.push(`update "${action.pageTitle}": failed to fetch existing blocks`)
          continue
        }

        // Step 2: append the new content blocks in chunks of 100
        const blocks = markdownToNotionBlocks(action.content)
        let updateFailed = false
        for (let i = 0; i < blocks.length; i += 100) {
          const appendR = await mcpClient.executeTool({
            tool: 'API-patch-block-children',
            parameters: { block_id: action.pageId, children: blocks.slice(i, i + 100) },
            approved: true,
          })
          if (!appendR.success) {
            failedActions.push(`update "${action.pageTitle}": ${appendR.error ?? 'Unknown error'}`)
            updateFailed = true
            break
          }
        }
        if (!updateFailed) results.push(`Updated: ${action.pageTitle}`)
      }
    }
  } finally {
    await mcpClient.disconnect()
  }

  return NextResponse.json({ success: true, results, failedActions })
}
