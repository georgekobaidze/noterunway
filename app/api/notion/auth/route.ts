import { redirect } from 'next/navigation'

export async function GET() {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return new Response('Notion OAuth is not configured. Set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_REDIRECT_URI.', {
      status: 500,
    })
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
  })

  redirect(`https://api.notion.com/v1/oauth/authorize?${params}`)
}
