import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/password'
import { signJwt } from '@/lib/jwt'
import { getAuthSecret } from '@/lib/auth-secret'
import { sendEmail } from '@/lib/email'

const CONFIRMATION_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json()
    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const existingUser = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } })
    if (existingUser) {
      if (!existingUser.confirmed) {
        const secret = getAuthSecret()
        if (!secret) {
          return NextResponse.json({ error: 'Server misconfigured: AUTH_SECRET or NEXTAUTH_SECRET missing' }, { status: 500 })
        }
        const token = await signJwt({ sub: existingUser.id, purpose: 'email-confirm' }, secret, CONFIRMATION_TTL_SECONDS)
        const confirmUrl = new URL('/confirm', req.nextUrl.origin)
        confirmUrl.searchParams.set('token', token)
        try {
          await sendEmail({
            to: existingUser.email,
            subject: 'Confirm your Property Stewards admin account',
            text: `Confirm your admin account by visiting ${confirmUrl.toString()}`,
            html: `<p>Hello ${existingUser.username},</p><p>Please confirm your Property Stewards admin account by clicking <a href="${confirmUrl.toString()}">this link</a>.</p><p>This link expires in 24 hours.</p>`
          })
        } catch (emailErr) {
          console.error('Failed to resend confirmation email', emailErr)
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

    const secret = getAuthSecret()
    if (!secret) {
      return NextResponse.json({ error: 'Server misconfigured: AUTH_SECRET or NEXTAUTH_SECRET missing' }, { status: 500 })
    }

    const token = await signJwt({ sub: user.id, purpose: 'email-confirm' }, secret, CONFIRMATION_TTL_SECONDS)
    const confirmUrl = new URL('/confirm', req.nextUrl.origin)
    confirmUrl.searchParams.set('token', token)

    try {
      await sendEmail({
        to: user.email,
        subject: 'Confirm your Property Stewards admin account',
        text: `Confirm your admin account by visiting ${confirmUrl.toString()}`,
        html: `<p>Hello ${user.username},</p><p>Thanks for signing up for the Property Stewards admin portal.</p><p>Please confirm your account by clicking <a href="${confirmUrl.toString()}">this link</a>. This link expires in 24 hours.</p>`
      })
    } catch (emailErr) {
      console.error('Failed to send confirmation email', emailErr)
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
