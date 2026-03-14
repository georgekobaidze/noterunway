import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return new Response('Notion OAuth is not configured. Set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_REDIRECT_URI.', {
      status: 500,
    })
  }

  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
    state,
  })

  const response = NextResponse.redirect(`https://api.notion.com/v1/oauth/authorize?${params}`)

  response.cookies.set('notion_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  })

  return response
}
