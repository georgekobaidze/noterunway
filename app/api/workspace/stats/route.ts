import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('notion_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  try {
    const client = new NotionClient(token)
    const stats = await client.getWorkspaceStats()
    return NextResponse.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
