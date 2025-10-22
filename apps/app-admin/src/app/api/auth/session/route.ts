import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('session')?.value
    if (!token) {
      return new Response(JSON.stringify({ user: null }), { headers: { 'Content-Type': 'application/json' } })
    }
    const secret = getAuthSecret()
    if (!secret) {
      return new Response(JSON.stringify({ user: null }), { headers: { 'Content-Type': 'application/json' } })
    }
    const payload = await verifyJwt<{ sub?: string }>(token, secret)
    const userId = payload?.sub
    if (!userId) {
      return new Response(JSON.stringify({ user: null }), { headers: { 'Content-Type': 'application/json' } })
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, username: true } })
    return new Response(JSON.stringify({ user }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new Response(JSON.stringify({ user: null }), { headers: { 'Content-Type': 'application/json' } })
  }
}

