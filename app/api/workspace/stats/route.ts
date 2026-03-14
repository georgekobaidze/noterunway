import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'

const VALID_STATS = ['totalPages', 'topLevelPages', 'recentlyEditedPages', 'duplicateCandidates'] as const
type StatKey = typeof VALID_STATS[number]

export async function GET(req: NextRequest) {
  const token = req.cookies.get('notion_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const stat = req.nextUrl.searchParams.get('stat') as StatKey | null

  try {
    const client = new NotionClient(token)
    const stats = await client.getWorkspaceStats()

    if (stat) {
      if (!(VALID_STATS as readonly string[]).includes(stat)) {
        return NextResponse.json({ error: 'invalid stat' }, { status: 400 })
      }
      return NextResponse.json({ [stat]: stats[stat] })
    }

    return NextResponse.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
