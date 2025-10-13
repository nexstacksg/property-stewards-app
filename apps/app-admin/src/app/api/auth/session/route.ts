import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthSecret } from '@/lib/auth-secret'
import prisma from '@/lib/prisma'
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
    const res = NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return res
  }

  // Verify user still exists in DB
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, username: true, email: true, confirmed: true, role: true } })
  if (!user) {
    const res = NextResponse.json({ error: 'User no longer exists' }, { status: 401 })
    res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return res
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role as any,
      username: user.username ?? '',
      confirmed: user.confirmed,
    },
  })
}
