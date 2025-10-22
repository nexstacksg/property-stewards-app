import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'
import { hashPassword } from '@/lib/password'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveCurrentUserId(req: NextRequest) {
  const session = req.cookies.get('session')?.value
  if (!session) return null
  const secret = getAuthSecret()
  if (!secret) return null
  const payload = await verifyJwt<{ sub?: string }>(session, secret)
  return payload?.sub || null
}

function isValidEmail(value: string) {
  return /.+@.+\..+/.test(value)
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveCurrentUserId(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as { username?: string; email?: string; password?: string }
    const updates: any = {}

    if (typeof body.username === 'string') {
      const username = body.username.trim()
      if (!username) return new Response(JSON.stringify({ error: 'Username is required' }), { status: 400 })
      updates.username = username
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim()
      if (!isValidEmail(email)) return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400 })
      updates.email = email
    }

    if (typeof body.password === 'string') {
      const pwd = body.password.trim()
      if (pwd.length > 0) {
        if (pwd.length < 8) return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400 })
        updates.passwordHash = hashPassword(pwd)
      }
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: 'No changes provided' }), { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: { id: true, username: true, email: true, confirmed: true }
    })

    return new Response(JSON.stringify({ user: updated }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error: any) {
    // Handle unique constraint violations (Prisma P2002)
    const code = error?.code
    if (code === 'P2002') {
      const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(', ') : 'field'
      return new Response(JSON.stringify({ error: `This ${target} is already in use.` }), { status: 400 })
    }
    console.error('Failed to update user account', error)
    return new Response(JSON.stringify({ error: 'Failed to update account' }), { status: 500 })
  }
}

