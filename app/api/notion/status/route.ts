import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('notion_token')?.value
  if (!token) {
    return NextResponse.json({ connected: false })
  }

  // Read workspace info from the companion cookie (set alongside the token)
  const raw = req.cookies.get('notion_workspace')?.value
  let workspace: { name: string; id: string } | null = null
  if (raw) {
    try {
      workspace = JSON.parse(decodeURIComponent(raw))
    } catch {
      // Cookie exists but unparseable — still connected, just no name
      workspace = { name: '', id: '' }
    }
  }

  return NextResponse.json({ connected: true, workspace })
}
