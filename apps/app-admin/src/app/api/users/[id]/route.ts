import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'
import { hashPassword } from '@/lib/password'

async function requireAdmin(req: NextRequest) {
  try {
    const token = req.cookies.get('session')?.value
    const secret = getAuthSecret()
    if (!token || !secret) return null
    const payload = await verifyJwt<{ sub?: string; role?: string }>(token, secret)
    if (!payload?.sub || payload.role !== 'ADMIN') return null
    return payload.sub
  } catch {
    return null
  }
}

// GET /api/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, confirmed: true, role: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

// PUT /api/users/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await request.json().catch(() => ({})) as { username?: string; email?: string; password?: string; confirmed?: boolean }

    const updates: any = {}
    if (typeof body.username === 'string') {
      const val = body.username.trim()
      if (!val) return NextResponse.json({ error: 'Username is required' }, { status: 400 })
      updates.username = val
    }
    if (typeof body.email === 'string') {
      const val = body.email.trim()
      if (!/.+@.+\..+/.test(val)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
      updates.email = val
    }
    if (typeof body.password === 'string') {
      const val = body.password.trim()
      if (val.length > 0 && val.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      if (val.length > 0) updates.passwordHash = hashPassword(val)
    }
    if (typeof body.confirmed === 'boolean') {
      updates.confirmed = body.confirmed
    }

    // Check for unique constraints when changing username/email
    if (updates.username || updates.email) {
      const existing = await prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                updates.username ? { username: updates.username } : undefined,
                updates.email ? { email: updates.email } : undefined,
              ].filter(Boolean) as any,
            },
          ],
        },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json({ error: 'Username or email already in use' }, { status: 409 })
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updates,
      select: { id: true, username: true, email: true, confirmed: true, role: true },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export const PATCH = PUT

// DELETE /api/users/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ message: 'User deleted' })
  } catch (error: any) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
