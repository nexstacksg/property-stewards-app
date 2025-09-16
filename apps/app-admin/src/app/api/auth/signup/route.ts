import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/password'
import { signJwt } from '@/lib/jwt'
import { getAuthSecret } from '@/lib/auth-secret'

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json()
    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const passwordHash = hashPassword(password)
    let user
    try {
      user = await prisma.user.create({ data: { username, email, passwordHash } })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json({ error: 'User already exists' }, { status: 409 })
      }
      throw err
    }

    const secret = getAuthSecret()
    if (!secret) {
      return NextResponse.json({ error: 'Server misconfigured: AUTH_SECRET or NEXTAUTH_SECRET missing' }, { status: 500 })
    }

    const token = await signJwt({ sub: user.id, role: user.role, email: user.email, username: user.username ?? undefined }, secret, 60 * 60 * 24 * 7)
    const res = NextResponse.json({ id: user.id, username: user.username, email: user.email, role: user.role })
    res.cookies.set('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return res
  } catch (e: any) {
    console.error('Signup error', e)
    const hint = process.env.NODE_ENV !== 'production' && e?.message?.includes('prisma.user')
      ? 'Prisma client may be out of date. Run `pnpm prisma generate` and a migration.'
      : undefined
    return NextResponse.json({ error: 'Internal error', hint }, { status: 500 })
  }
}
