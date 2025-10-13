import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  const secret = getAuthSecret()
  if (!token || !secret) {
    const res = NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return res
  }

  const payload = await verifyJwt<{ sub?: string }>(token, secret)
  if (!payload?.sub) {
    const res = NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return res
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } })
  if (!user) {
    const res = NextResponse.json({ error: 'User not found' }, { status: 401 })
    res.cookies.set('session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
    return res
  }

  return NextResponse.json({ ok: true })
}

