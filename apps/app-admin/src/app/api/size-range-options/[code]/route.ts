import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function DELETE(_req: NextRequest, ctx: { params: { code: string } }) {
  try {
    const code = String((await ctx.params).code || '').toUpperCase()
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    await prisma.propertySizeRangeOption.delete({ where: { code: code as any } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}

