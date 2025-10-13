import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await request.json().catch(() => ({})) as { name?: string; code?: string }
    const data: any = {}
    if (typeof body.name === 'string' && body.name.trim().length > 0) data.name = body.name.trim()
    if (typeof body.code === 'string' && body.code.trim().length > 0) data.code = body.code.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })
    const updated = await (prisma as any).propertySizeOption.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH property-size option failed', error)
    return NextResponse.json({ error: 'Failed to update size option' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    await (prisma as any).propertySizeOption.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE property-size option failed', error)
    return NextResponse.json({ error: 'Failed to delete size option' }, { status: 500 })
  }
}

