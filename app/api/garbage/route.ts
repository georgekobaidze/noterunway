import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
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

  const raw = parseInt(req.nextUrl.searchParams.get('staleDays') ?? '90', 10)
  const staleDays = Math.max(1, isNaN(raw) ? 90 : raw)

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
    const raw = await req.json().catch(() => null)
    const parsed = z.object({
      pages: z.array(z.object({
        id: z.string().min(1),
        title: z.string().default('(untitled)'),
      })).min(1),
      reason: z.string().optional(),
    }).safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request', details: parsed.error.flatten() }, { status: 400 })
    }

    const { pages, reason } = parsed.data
    const notion = new NotionClient(token)
    const failedIds = new Set<string>()
    const concurrency = 5

    for (let i = 0; i < pages.length; i += concurrency) {
      const batch = pages.slice(i, i + concurrency)
      await Promise.all(
        batch.map(async ({ id, title }: { id: string; title: string }) => {
          try {
            await notion.moveToArchive(id, 'garbage', {
              title: title || '(untitled)',
              reason: reason ?? 'Identified as garbage',
            })
          } catch (err) {
            failedIds.add(id)
            console.error(`Failed to archive page ${id}:`, err)
          }
        })
      )
    }

    return NextResponse.json({
      success: true,
      archivedIds: pages
        .filter(({ id }: { id: string }) => !failedIds.has(id))
        .map(({ id }: { id: string }) => id),
      failedIds: Array.from(failedIds),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
