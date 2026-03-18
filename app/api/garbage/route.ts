import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'

function getNotionToken(req: NextRequest): string | null {
  return req.cookies.get('notion_token')?.value ?? null
}

// GET /api/garbage?staleDays=90
// Scans the workspace for orphaned, empty, and stale pages.
export async function GET(req: NextRequest) {
  const token = getNotionToken(req)
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const staleDays = Math.max(
    1,
    parseInt(req.nextUrl.searchParams.get('staleDays') ?? '90', 10) || 90
  )

  try {
    const notion = new NotionClient(token)
    const result = await notion.getGarbagePages(staleDays)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/garbage
// Body: { pages: { id: string, title: string }[], reason?: string }
// Archives each confirmed garbage page into the NoteRunway Archive / Garbage Collection folder.
export async function POST(req: NextRequest) {
  const token = getNotionToken(req)
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  try {
    const { pages, reason } = await req.json()
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'missing_pages' }, { status: 400 })
    }

    const notion = new NotionClient(token)
    const errors: string[] = []

    await Promise.all(
      pages.map(async ({ id, title }: { id: string; title: string }) => {
        try {
          await notion.moveToArchive(id, 'garbage', {
            title: title || '(untitled)',
            reason: reason ?? 'Identified as garbage',
          })
        } catch (err) {
          errors.push(id)
          console.error(`Failed to archive page ${id}:`, err)
        }
      })
    )

    return NextResponse.json({
      success: true,
      archivedIds: pages
        .filter(({ id }: { id: string }) => !errors.includes(id))
        .map(({ id }: { id: string }) => id),
      failedIds: errors,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
