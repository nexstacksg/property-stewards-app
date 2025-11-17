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

// GET /api/users - list users (admin only)
export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const skip = (page - 1) * limit

    const where: any = {}
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, username: true, email: true, confirmed: true, role: true },
        orderBy: { username: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      users: users.map((u) => ({ ...u, createdOn: null })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// POST /api/users - create user (admin only)
export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin(request)
    if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as { username?: string; email?: string; password?: string; confirmed?: boolean }
    const username = (body.username ?? '').trim()
    const email = (body.email ?? '').trim()
    const password = (body.password ?? '').trim()
    const confirmed = Boolean(body.confirmed)

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Enforce unique username/email
    const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] }, select: { id: true, email: true, username: true } })
    if (existing) {
      return NextResponse.json({ error: 'Username or email already in use' }, { status: 409 })
    }

    const created = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: hashPassword(password),
        confirmed,
        // role defaults to ADMIN per schema
      },
      select: { id: true, username: true, email: true, confirmed: true, role: true },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
