import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  const secret = getAuthSecret()

  if (!token || !secret) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const payload = await verifyJwt<{ sub?: string; email?: string; role?: string; username?: string }>(token, secret)
  if (!payload?.sub) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const user = {
    id: payload.sub,
    email: payload.email || '',
    role: payload.role || 'USER',
    username: payload.username,
  }

  return NextResponse.json({ user })
}

