import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { NotionClient } from '../notion/NotionClient'

export type MCPToolName =
  | 'search_pages'
  | 'get_page'
  | 'archive_page'
  | 'update_page_title'
  | 'create_page'

export interface MCPToolCall {
  tool: MCPToolName
  parameters: Record<string, unknown>
  approved: boolean
}

export interface MCPToolResult {
  tool: MCPToolName
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
  private notionClient: NotionClient

  constructor(notionToken: string) {
    this.notionClient = new NotionClient(notionToken)
  }

  // Execute a single approved tool call
  async executeTool(call: MCPToolCall): Promise<MCPToolResult> {
    // Safety gate — destructive tools require explicit approval
    const destructiveTools: MCPToolName[] = ['archive_page', 'update_page_title', 'create_page']
    if (destructiveTools.includes(call.tool) && !call.approved) {
      throw new MCPError(
        `Tool "${call.tool}" requires user approval before execution. Set approved: true to proceed.`
      )
    }

    try {
      const data = await this.runTool(call.tool, call.parameters)
      return { tool: call.tool, success: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { tool: call.tool, success: false, error: message }
    }
  }

  // Execute a list of approved tool calls in sequence
  async executeToolCalls(calls: MCPToolCall[]): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = []
    for (const call of calls) {
      const result = await this.executeTool(call)
      results.push(result)
    }
    return results
  }

  // Route tool name to the correct NotionClient method
  private async runTool(tool: MCPToolName, params: Record<string, unknown>): Promise<unknown> {
    switch (tool) {
      case 'search_pages': {
        return await this.notionClient.getAllPages()
      }

      case 'get_page': {
        const { pageId } = params as { pageId: string }
        if (!pageId) throw new MCPError('get_page requires a pageId parameter')
        return await this.notionClient.getPage(pageId)
      }

      case 'archive_page': {
        const { pageId } = params as { pageId: string }
        if (!pageId) throw new MCPError('archive_page requires a pageId parameter')
        await this.notionClient.archivePage(pageId)
        return { archived: true, pageId }
      }

      case 'update_page_title': {
        const { pageId, title } = params as { pageId: string; title: string }
        if (!pageId || !title) throw new MCPError('update_page_title requires pageId and title parameters')
        await this.notionClient.updatePageTitle(pageId, title)
        return { updated: true, pageId, title }
      }

      case 'create_page': {
        const { parentId, title } = params as { parentId: string; title: string }
        if (!parentId || !title) throw new MCPError('create_page requires parentId and title parameters')
        // Will be implemented when we need page creation
        throw new MCPError('create_page is not yet implemented')
      }

      default:
        throw new MCPError(`Unknown tool: ${tool}`)
    }
  }
}
