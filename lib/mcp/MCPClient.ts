import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const NOTION_MCP_URL = 'https://mcp.notion.com'

// Destructive tools that require explicit user approval before execution
const DESTRUCTIVE_TOOLS = ['archive', 'delete', 'update', 'create', 'append', 'move', 'restore']

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

  // Connect to Notion's hosted MCP server.
  // Tries Streamable HTTP first (modern), falls back to SSE (legacy).
  async connect(): Promise<void> {
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'User-Agent': 'NoteRunway/0.1.0',
    }

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${NOTION_MCP_URL}/mcp`),
        { requestInit: { headers } }
      )
      await this.client.connect(transport)
    } catch (firstError) {
      // Streamable HTTP failed — attempt SSE fallback
      try {
        const transport = new SSEClientTransport(
          new URL(`${NOTION_MCP_URL}/sse`),
          { requestInit: { headers } }
        )
        await this.client.connect(transport)
      } catch (secondError) {
        const firstMessage =
          firstError instanceof Error ? firstError.message : String(firstError)
        const secondMessage =
          secondError instanceof Error ? secondError.message : String(secondError)
        const error = new MCPError(
          `Failed to connect to MCP server. ` +
            `Streamable HTTP error: ${firstMessage}. ` +
            `SSE fallback error: ${secondMessage}`
        )
        ;(error as any).cause = firstError
        throw error
      }
    }

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
