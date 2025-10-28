import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/password'
import {
  CONFIRMATION_TTL_SECONDS,
  createConfirmationToken,
  sendConfirmationEmail,
} from '@/lib/auth-confirmation'
import { getRequestOrigin } from '@/lib/origin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json()
    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    console.info('[signup] Incoming signup request', { email, username })

    const existingUser = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } })
    if (existingUser) {
      if (!existingUser.confirmed) {
        console.info('[signup] Existing unconfirmed user found, resending confirmation', { userId: existingUser.id })
        const resend = await sendConfirmationEmail({
          user: { id: existingUser.id, username: existingUser.username, email: existingUser.email },
          origin: getRequestOrigin(req),
        })

        if (!resend) {
          return NextResponse.json({ error: 'Unable to send confirmation email. Try again later.' }, { status: 500 })
        }

        return NextResponse.json({ message: 'Account already pending confirmation. A new confirmation email has been sent if delivery is configured.' })
      }
      return NextResponse.json({ error: 'User already exists' }, { status: 409 })
    }

    const passwordHash = hashPassword(password)
    let user
    try {
      user = await prisma.user.create({ data: { username, email, passwordHash, confirmed: false } })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json({ error: 'User already exists' }, { status: 409 })
      }
      throw err
    }

    console.info('[signup] Created user', { userId: user.id })

    const token = await createConfirmationToken(user.id, CONFIRMATION_TTL_SECONDS)
    if (!token) {
      return NextResponse.json({ error: 'Server misconfigured: AUTH_SECRET or NEXTAUTH_SECRET missing' }, { status: 500 })
    }

    const emailResult = await sendConfirmationEmail({
      user: { id: user.id, username: user.username, email: user.email },
      origin: getRequestOrigin(req),
      token,
    })

    if (!emailResult) {
      return NextResponse.json({ error: 'Unable to send confirmation email. Try again later.' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Account created. Check your email to confirm your address.' }, { status: 201 })
  } catch (e: any) {
    console.error('Signup error', e)
    const hint = process.env.NODE_ENV !== 'production' && e?.message?.includes('prisma.user')
      ? 'Prisma client may be out of date. Run `pnpm prisma generate` and a migration.'
      : undefined
    return NextResponse.json({ error: 'Internal error', hint }, { status: 500 })
  }
}
