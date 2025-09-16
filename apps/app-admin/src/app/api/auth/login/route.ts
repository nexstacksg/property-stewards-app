import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyPassword } from '@/lib/password'
import { signJwt } from '@/lib/jwt'
import { getAuthSecret } from '@/lib/auth-secret'

export async function POST(req: NextRequest) {
  try {
    const { email, username, password, remember } = await req.json()
    if ((!email && !username) || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const user = await prisma.user.findFirst({ where: { OR: [{ email: email || '' }, { username: username || '' }] } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user.confirmed) {
      return NextResponse.json({ error: 'Please confirm your email address before signing in.' }, { status: 403 })
    }

    const secret = getAuthSecret()
    if (!secret) {
      return NextResponse.json({ error: 'Server misconfigured: AUTH_SECRET or NEXTAUTH_SECRET missing' }, { status: 500 })
    }

    const tokenTtl = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7
    const token = await signJwt({ sub: user.id, role: user.role, email: user.email, username: user.username ?? undefined }, secret, tokenTtl)
    const res = NextResponse.json({ id: user.id, username: user.username, email: user.email, role: user.role })
    res.cookies.set('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: remember ? 60 * 60 * 24 * 30 : undefined,
    })
    return res
  } catch (e) {
    console.error('Login error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
