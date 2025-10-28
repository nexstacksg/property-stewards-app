import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/password-reset'
import getAppOrigin from '@/lib/app-origin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Always respond 200 to avoid user enumeration
    if (!user) {
      return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' })
    }

    const sent = await sendPasswordResetEmail({ id: user.id, email: user.email, username: user.username }, getAppOrigin(req))
    if (!sent) {
      return NextResponse.json({ error: 'Unable to send reset email. Try again later.' }, { status: 500 })
    }

    return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' })
  } catch (e) {
    console.error('[password-forgot] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
