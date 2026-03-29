import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const fwdHost = req.headers.get('x-forwarded-host')
  const fwdProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = fwdHost ? `${fwdProto}://${fwdHost}` : 'http://localhost:3000'

  const response = NextResponse.redirect(
    new URL('/', origin),
    { status: 303 },
  )
  response.cookies.delete('notion_token')
  response.cookies.delete('notion_workspace')
  return response
}
