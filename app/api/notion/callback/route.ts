import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'

const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?error=access_denied', appUrl))
  }

  // Validate OAuth state parameter to prevent CSRF/login swapping
  const storedState = req.cookies.get('notion_oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/settings?error=invalid_state', appUrl))
  }

  const clientId = process.env.NOTION_OAUTH_CLIENT_ID
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL('/settings?error=not_configured', appUrl))
  }

  // Exchange authorization code for access token
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', appUrl))
  }

  let tokenData: Record<string, unknown>
  try {
    tokenData = await tokenRes.json()
  } catch {
    return NextResponse.redirect(new URL('/settings?error=invalid_response', appUrl))
  }

  const { access_token, workspace_name, workspace_id } = tokenData as {
    access_token?: string; workspace_name?: string; workspace_id?: string
  }
  if (!access_token || typeof access_token !== 'string') {
    return NextResponse.redirect(new URL('/settings?error=missing_token', appUrl))
  }

  // Pre-create the NoteRunway Archive folder structure in the user's workspace.
  // Best-effort — don't block the OAuth flow if this fails.
  try {
    const notion = new NotionClient(access_token)
    await notion.ensureArchiveStructure()
  } catch (err) {
    console.error('Failed to create archive structure:', err)
  }

  // Store token in httpOnly cookie — never exposed to JavaScript
  const response = NextResponse.redirect(new URL('/settings?connected=true', appUrl))
  response.cookies.set('notion_token', access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  const notionWorkspace = encodeURIComponent(JSON.stringify({ name: workspace_name, id: workspace_id }))
  response.cookies.set('notion_workspace', notionWorkspace, {
    httpOnly: false, // readable by JS so UI can show workspace name
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  // Clear the OAuth state cookie to prevent reuse
  response.cookies.delete('notion_oauth_state')

  return response
}
