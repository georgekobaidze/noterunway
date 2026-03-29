import { NextRequest, NextResponse } from 'next/server'
import { NotionClient } from '@/lib/notion/NotionClient'

// Derive the public-facing origin so redirects work behind reverse proxies (e.g. Railway).
// Railway terminates HTTPS and forwards to the app on an internal port, so req.url
// reports something like http://localhost:8080 instead of the real public domain.
function getOrigin(req: NextRequest): string {
  const fwdHost = req.headers.get('x-forwarded-host')
  const fwdProto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (fwdHost) return `${fwdProto}://${fwdHost}`

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI
  if (redirectUri) {
    try { return new URL(redirectUri).origin } catch { /* fall through */ }
  }

  return new URL(req.url).origin
}

export async function GET(req: NextRequest) {
  const origin = getOrigin(req)
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?error=access_denied', origin))
  }

  // Validate OAuth state parameter to prevent CSRF/login swapping
  const storedState = req.cookies.get('notion_oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/settings?error=invalid_state', origin))
  }

  const clientId = process.env.NOTION_OAUTH_CLIENT_ID
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL('/settings?error=not_configured', origin))
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
    return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', origin))
  }

  let tokenData: Record<string, unknown>
  try {
    tokenData = await tokenRes.json()
  } catch {
    return NextResponse.redirect(new URL('/settings?error=invalid_response', origin))
  }

  const { access_token, workspace_name, workspace_id } = tokenData as {
    access_token?: string; workspace_name?: string; workspace_id?: string
  }
  if (!access_token || typeof access_token !== 'string') {
    return NextResponse.redirect(new URL('/settings?error=missing_token', origin))
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
  const response = NextResponse.redirect(new URL('/settings?connected=true', origin))
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
