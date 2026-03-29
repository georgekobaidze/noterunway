import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'

function getNotionToken(req: NextRequest): string | null {
  return req.cookies.get('notion_token')?.value ?? null
}

// GET /api/graph
// Returns all workspace pages as graph nodes + edges (parent/child + @mention).
// Archive pages are excluded. Read-only.
export async function GET(req: NextRequest) {
  const token = getNotionToken(req)
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  try {
    const notion = new NotionClient(token)
    const result = await notion.getGraphData()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
