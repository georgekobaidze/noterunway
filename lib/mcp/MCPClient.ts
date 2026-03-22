import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { resolve } from 'path'

// Destructive tools that require explicit user approval before execution.
// Matches against substrings of tool names (API-prefixed, from @notionhq/notion-mcp-server).
const DESTRUCTIVE_TOOLS = ['patch', 'post-page', 'delete-a-block', 'API-post-page', 'move-page', 'update-a-data-source', 'create-a-data-source']

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
    const serverBin = resolve(
      process.cwd(),
      'node_modules/@notionhq/notion-mcp-server/bin/cli.mjs'
    )

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverBin],
      env: {
        ...process.env,
        NOTION_TOKEN: this.accessToken,
        // Suppress info/debug logs from the child process so they don't pollute
        // our SSE stream. The server writes logs to stderr which is discarded.
        NODE_ENV: 'production',
      },
    })

    await this.client.connect(transport)
    this.connected = true
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
      })
      return { tool: call.tool, success: true, data: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
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
