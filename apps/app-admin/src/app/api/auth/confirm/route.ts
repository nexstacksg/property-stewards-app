import { NextRequest, NextResponse } from 'next/server'
import { confirmUserByToken } from '@/lib/auth-confirmation'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const result = await confirmUserByToken(token)

  if (result === 'missing-token') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  if (result === 'config-error') {
    return NextResponse.json({ error: 'Server misconfigured: AUTH_SECRET or NEXTAUTH_SECRET missing' }, { status: 500 })
  }

  const url = new URL('/login', req.nextUrl.origin)
  const map: Record<string, string> = {
    success: 'success',
    invalid: 'invalid',
    'missing-user': 'missing-user',
    'config-error': 'server-error',
    'missing-token': 'invalid',
  }
  url.searchParams.set('confirmation', map[result] ?? 'invalid')
  return NextResponse.redirect(url)
}
