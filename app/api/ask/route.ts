import { streamText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { NextRequest } from 'next/server'
import { MCPClient } from '@/lib/mcp/MCPClient'
import { NotionClient } from '@/lib/notion/NotionClient'
import { getModelWithKey, MODEL_META, DEFAULT_MODEL, type ModelId } from '@/lib/models'

// ─── Request schema ──────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const RequestBodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
})

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI assistant for NoteRunway, helping users manage their Notion workspace through natural conversation.

You have tools to read the workspace:
- search_pages: search for pages by keyword or topic
- get_page: read metadata of a specific page by its ID
- get_page_content: read the actual text content/blocks of a page
- run_analysis: run a built-in workspace analysis (dead_links, garbage, workspace_stats, or sensitive_data)

When asked to make changes (archive, create, rename pages, add/write/append to pages, replace page content):
1. Use search_pages to find the relevant page(s) first — you MUST have the real page ID before calling propose_actions
2. Extract the page ID from the search results (it is in the "id" field of each result object)
3. Call propose_actions with a structured list of changes — do not skip this step
4. Briefly tell the user what you've proposed

IMPORTANT — choose the right action type for writes:
- "rename" — changes the page title only, nothing else. Use when user says "rename", "change title", "change name"
- "append" — adds content to the END of a page without touching existing content. Use when user says "add", "write", "append", "insert", or similar
- "update" — REPLACES ALL existing content on the page. Only use when user explicitly says "replace", "overwrite", or "rewrite the whole page"
- When in doubt, use "append" — it is non-destructive

IMPORTANT for create actions:
- If the user specifies a parent page, search for it first to get its UUID and set parentPageId to that UUID
- If the user wants the page at workspace root (no parent / top level), set parentPageId to empty string ""
- The content field can be an empty string "" if the user wants a blank page

IMPORTANT for archive actions:
- Search for the page, extract its "id" field, and use that as pageId
- The id is a UUID like "32bc3afc-3cbd-817a-83e6-f1a01cd30ab8"

Rules:
- Never skip propose_actions for any write operation
- Never ask the user for a page ID — find it yourself with search_pages
- Be concise — this is a terminal interface
- When searching, prefer targeted queries over broad ones
- For questions about orphaned pages, dead links, or stale pages — use run_analysis
- For questions about passwords, secrets, API keys, tokens, or any sensitive data in pages — use run_analysis with type "sensitive_data"`

// ─── POST /api/ask — streaming agentic chat ───────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.cookies.get('notion_token')?.value ?? null
  if (!token) {
    return new Response(JSON.stringify({ error: 'not_connected' }), { status: 401 })
  }

  const aiKey = req.headers.get('x-ai-key')
  if (!aiKey) {
    return new Response(JSON.stringify({ error: 'missing_ai_key' }), { status: 400 })
  }

  const requestedModel = req.headers.get('x-ai-model')
  const modelId: ModelId = (requestedModel && MODEL_META.some((m) => m.id === requestedModel))
    ? requestedModel as ModelId
    : DEFAULT_MODEL

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_json' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const parsed = RequestBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'invalid_request', message: 'messages must be a non-empty array of {role, content} objects' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const messages = parsed.data.messages as { role: 'user' | 'assistant'; content: string }[]
  const model = getModelWithKey(modelId, aiKey)

  const encoder = new TextEncoder()
  const mcpClient = new MCPClient(token)
  let mcpConnected = false
  let stepCounter = 0

  const ensureMcp = async () => {
    if (!mcpConnected) {
      await mcpClient.connect()
      mcpConnected = true
    }
  }

  // MCP tool wrapper — connects lazily, always sends tool_end
  const runMcpTool = async (
    stepId: string,
    toolName: string,
    mcpTool: string,
    parameters: Record<string, unknown>,
    approved = false,
  ) => {
    try {
      await ensureMcp()
      const r = await mcpClient.executeTool({ tool: mcpTool, parameters, approved })
      send('tool_end', { stepId, tool: toolName, success: r.success })
      return r.success ? r.data : { error: r.error }
    } catch (err) {
      send('tool_end', { stepId, tool: toolName, success: false })
      return { error: err instanceof Error ? err.message : 'Tool failed' }
    }
  }

  // send is defined inside the stream callback; forward-declare for runMcpTool
  let send: (event: string, data: unknown) => void = () => {}

  const stream = new ReadableStream({
    async start(controller) {
      send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

      try {
        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages,
          stopWhen: stepCountIs(10),
          tools: {
            search_pages: tool({
              description: 'Search for pages in the Notion workspace by keyword or topic',
              inputSchema: z.object({
                query: z.string().describe('Search query'),
              }),
              execute: async (input) => {
                const stepId = `step-${++stepCounter}`
                send('tool_start', { stepId, tool: 'search_pages', args: { query: input.query } })
                return runMcpTool(stepId, 'search_pages', 'API-post-search', {
                  query: input.query,
                  filter: { value: 'page', property: 'object' },
                  page_size: 20,
                })
              },
            }),

            get_page: tool({
              description: 'Get the metadata of a specific Notion page by its ID',
              inputSchema: z.object({
                page_id: z.string().describe('The Notion page ID'),
              }),
              execute: async (input) => {
                const stepId = `step-${++stepCounter}`
                send('tool_start', { stepId, tool: 'get_page', args: { page_id: input.page_id } })
                return runMcpTool(stepId, 'get_page', 'API-retrieve-a-page', { page_id: input.page_id })
              },
            }),

            get_page_content: tool({
              description: 'Read the actual block content (text, bullets, headings) of a Notion page',
              inputSchema: z.object({
                page_id: z.string().describe('The Notion page ID'),
              }),
              execute: async (input) => {
                const stepId = `step-${++stepCounter}`
                send('tool_start', { stepId, tool: 'get_page_content', args: { page_id: input.page_id } })
                return runMcpTool(stepId, 'get_page_content', 'API-get-block-children', { block_id: input.page_id })
              },
            }),

            run_analysis: tool({
              description: 'Run a workspace analysis. Use "dead_links" to find pages with broken/orphaned links, "garbage" to find stale/empty pages, "workspace_stats" for a summary, or "sensitive_data" to scan all pages for accidentally stored secrets, passwords, API keys, tokens, and PII.',
              inputSchema: z.object({
                type: z.enum(['dead_links', 'garbage', 'workspace_stats', 'sensitive_data']).describe('Which analysis to run'),
              }),
              execute: async (input) => {
                const stepId = `step-${++stepCounter}`
                send('tool_start', { stepId, tool: 'run_analysis', args: { type: input.type } })
                try {
                  const notion = new NotionClient(token)
                  let data: unknown
                  if (input.type === 'dead_links') {
                    data = await notion.getDeadLinks()
                  } else if (input.type === 'garbage') {
                    data = await notion.getGarbagePages()
                  } else if (input.type === 'sensitive_data') {
                    data = await notion.getSensitiveFindings()
                  } else {
                    data = await notion.getWorkspaceStats()
                  }
                  send('tool_end', { stepId, tool: 'run_analysis', success: true })
                  return data
                } catch (err) {
                  send('tool_end', { stepId, tool: 'run_analysis', success: false })
                  return { error: err instanceof Error ? err.message : 'Analysis failed' }
                }
              },
            }),

            propose_actions: tool({
              description: 'Propose write actions (archive, create, rename, append to, or replace page content) that require user approval before execution',
              inputSchema: z.object({
                summary: z.string().describe('Brief explanation of what you are proposing'),
                actions: z.array(
                  z.discriminatedUnion('type', [
                    z.object({
                      type: z.literal('archive'),
                      pageId: z.string(),
                      pageTitle: z.string(),
                      reason: z.string(),
                    }),
                    z.object({
                      type: z.literal('create'),
                      parentPageId: z.string().describe('UUID of the parent page, or empty string "" for workspace root'),
                      title: z.string(),
                      content: z.string().default(''),
                    }),
                    z.object({
                      type: z.literal('rename'),
                      pageId: z.string(),
                      pageTitle: z.string().describe('Current page title'),
                      newTitle: z.string().describe('New title for the page'),
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
                ),
              }),
              execute: async (input) => {
                send('propose_actions', { summary: input.summary, actions: input.actions })
                return `Proposed ${input.actions.length} action(s). Awaiting user approval.`
              },
            }),
          },
        })

        for await (const chunk of result.textStream) {
          send('text', chunk)
        }

        send('done', {})
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        send('error', { message })
      } finally {
        await mcpClient.disconnect()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
