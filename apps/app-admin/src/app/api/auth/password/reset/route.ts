import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyPasswordResetToken } from '@/lib/password-reset'
import { hashPassword } from '@/lib/password'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Missing token or password' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const payload = await verifyPasswordResetToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const passwordHash = hashPassword(password)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    return NextResponse.json({ message: 'Password reset successfully' })
  } catch (e) {
    console.error('[password-reset] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

