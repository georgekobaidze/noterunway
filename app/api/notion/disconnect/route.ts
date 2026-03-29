import { NextResponse } from 'next/server'

const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

export async function POST() {
  const response = NextResponse.redirect(
    new URL('/', appUrl),
    { status: 303 },
  )
  response.cookies.delete('notion_token')
  response.cookies.delete('notion_workspace')
  return response
}
