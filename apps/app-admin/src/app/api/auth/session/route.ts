import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'

type SessionToken = {
  sub?: string
  email?: string
  role?: string
  username?: string
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const secret = getAuthSecret()
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const payload = await verifyJwt<SessionToken>(token, secret)
  if (!payload || !payload.sub) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: payload.sub,
      email: payload.email ?? '',
      role: payload.role ?? 'user',
      username: payload.username ?? '',
    },
  })
}
