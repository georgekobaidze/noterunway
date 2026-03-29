import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'

// Destructive tools that require explicit user approval before execution.
// Matches against substrings of tool names (API-prefixed, from @notionhq/notion-mcp-server).
const DESTRUCTIVE_TOOLS = ['patch', 'post-page', 'delete-a-block', 'move-page', 'update-a-data-source', 'create-a-data-source']

export interface MCPToolCall {
  tool: string
  parameters: Record<string, unknown>
  approved: boolean
}

export interface MCPToolResult {
  tool: string
  success: boolean
  data?: unknown
  error?: string
}

export class MCPError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MCPError'
  }
}

export class MCPClient {
  private client: Client
  private accessToken: string
  private connected = false

  constructor(accessToken: string) {
    this.accessToken = accessToken
    this.client = new Client({ name: 'noterunway', version: '0.1.0' })
  }

  // Connect by spawning the local @notionhq/notion-mcp-server process via stdio.
  // This uses the user's Notion OAuth access token (ntn_xxx) directly — no
  // separate MCP OAuth flow required.
  async connect(): Promise<void> {
    const serverBin = path.join(process.cwd(), 'node_modules', '@notionhq', 'notion-mcp-server', 'bin', 'cli.mjs')

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverBin],
      env: {
        ...process.env,
        NOTION_TOKEN: this.accessToken,
        NODE_ENV: 'production',
      },
    })

    try {
      await this.client.connect(transport)
      this.connected = true
    } catch (err) {
      // Kill the spawned subprocess to prevent orphan node.exe processes
      try { await transport.close() } catch { /* already dead */ }
      throw err
    }
  }

  // Disconnect from the MCP server
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close()
      this.connected = false
    }
  }

  // Returns a list of all tools available on Notion's MCP server
  async listTools(): Promise<string[]> {
    this.ensureConnected()
    const { tools } = await this.client.listTools()
    return tools.map((t) => t.name)
  }

  // Execute a single tool call — always returns MCPToolResult, never throws
  async executeTool(call: MCPToolCall): Promise<MCPToolResult> {
    this.ensureConnected()

    const isDestructive = DESTRUCTIVE_TOOLS.some((keyword) =>
      call.tool.toLowerCase().includes(keyword)
    )

    if (isDestructive && !call.approved) {
      return {
        tool: call.tool,
        success: false,
        error: `Tool "${call.tool}" modifies your workspace and requires user approval.`,
      }
    }

    try {
      const result = await this.client.callTool({
        name: call.tool,
        arguments: call.parameters,
      }) as { content?: { type: string; text?: string }[]; isError?: boolean }

      // Extract readable text from MCP content blocks
      const text = result.content
        ?.filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n') ?? ''

      if (result.isError) {
        console.error(`[MCPClient] Tool "${call.tool}" returned isError:`, text)
        return { tool: call.tool, success: false, error: text || 'Tool returned an error' }
      }

      // Parse the text as JSON if possible (Notion API returns JSON in text blocks)
      try {
        const parsed = JSON.parse(text)
        // Notion API errors arrive as { object: 'error', ... } inside text blocks
        // but MCP may not set the isError flag for them
        if (parsed && typeof parsed === 'object' && parsed.object === 'error') {
          const errMsg = parsed.message || parsed.code || text
          console.error(`[MCPClient] Tool "${call.tool}" returned Notion API error:`, errMsg)
          return { tool: call.tool, success: false, error: errMsg }
        }
        return { tool: call.tool, success: true, data: parsed }
      } catch {
        return { tool: call.tool, success: true, data: text }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[MCPClient] Tool "${call.tool}" threw:`, message)
      return { tool: call.tool, success: false, error: message }
    }
  }

  // Execute multiple tool calls in sequence
  async executeToolCalls(calls: MCPToolCall[]): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = []
    for (const call of calls) {
      const result = await this.executeTool(call)
      results.push(result)
    }
    return results
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new MCPError('MCPClient is not connected. Call connect() first.')
    }
  }
}
