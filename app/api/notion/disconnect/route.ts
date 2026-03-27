import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.redirect(
    new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    { status: 303 },
  )
  response.cookies.delete('notion_token')
  response.cookies.delete('notion_workspace')
  return response
}
