import { Client, isFullPage } from '@notionhq/client'
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

export type NotionPage = PageObjectResponse

export class NotionError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'NotionError'
  }
}

export class NotionClient {
  private client: Client

  constructor(token: string) {
    this.client = new Client({ auth: token })
  }

  // Fetch all pages from the workspace (handles pagination automatically)
  async getAllPages(): Promise<NotionPage[]> {
    const pages: NotionPage[] = []
    let cursor: string | undefined = undefined

    try {
      do {
        const response = await this.client.search({
          filter: { property: 'object', value: 'page' },
          start_cursor: cursor,
          page_size: 100,
        })

        for (const result of response.results) {
          if (isFullPage(result)) {
            pages.push(result)
          }
        }

        cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
      } while (cursor)
    } catch (err: unknown) {
      throw this.handleError(err)
    }

    return pages
  }

  // Fetch a single page by ID
  async getPage(pageId: string): Promise<NotionPage> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId })
      if (!isFullPage(page)) {
        throw new NotionError('Received a partial page response — check integration permissions.')
      }
      return page
    } catch (err: unknown) {
      throw this.handleError(err)
    }
  }

  // Recursively fetches all blocks including nested children
  private async fetchBlockChildrenRecursively(
    blockId: string,
    blocks: BlockObjectResponse[]
  ): Promise<void> {
    let cursor: string | undefined = undefined
    do {
      const response = await this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      })
      for (const block of response.results) {
        if ('type' in block) {
          const fullBlock = block as BlockObjectResponse
          blocks.push(fullBlock)
          if (fullBlock.has_children) {
            await this.fetchBlockChildrenRecursively(fullBlock.id, blocks)
          }
        }
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
    } while (cursor)
  }

  // Fetch all content blocks of a page, including nested children
  async getPageBlocks(pageId: string): Promise<BlockObjectResponse[]> {
    const blocks: BlockObjectResponse[] = []
    try {
      await this.fetchBlockChildrenRecursively(pageId, blocks)
    } catch (err: unknown) {
      throw this.handleError(err)
    }

    return blocks
  }

  // Soft-delete (archive) a page
  async archivePage(pageId: string): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: pageId,
        archived: true,
      })
    } catch (err: unknown) {
      throw this.handleError(err)
    }
  }

  // Update a page's title
  async updatePageTitle(pageId: string, title: string): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: pageId,
        properties: {
          title: {
            title: [{ type: 'text', text: { content: title } }],
          },
        },
      })
    } catch (err: unknown) {
      throw this.handleError(err)
    }
  }

  // Validate the token by making a lightweight API call
  async validateToken(): Promise<boolean> {
    try {
      await this.client.users.me({})
      return true
    } catch (err: unknown) {
      const normalizedError = this.handleError(err)
      if (normalizedError.code === 'unauthorized') {
        return false
      }
      throw normalizedError
    }
  }

  private handleError(err: unknown): NotionError {
    if (err instanceof NotionError) return err

    if (typeof err === 'object' && err !== null && 'code' in err) {
      const e = err as { code: string; message: string }
      if (e.code === 'unauthorized') {
        return new NotionError('Invalid Notion token. Check your integration token.', e.code)
      }
      if (e.code === 'object_not_found') {
        return new NotionError('Page not found. Make sure the integration has access to it.', e.code)
      }
      if (e.code === 'rate_limited') {
        return new NotionError('Notion rate limit hit. Please try again in a moment.', e.code)
      }
      return new NotionError(e.message ?? 'Unknown Notion API error', e.code)
    }

    if (err instanceof Error) {
      return new NotionError(err.message)
    }

    return new NotionError('An unexpected error occurred')
  }
}
