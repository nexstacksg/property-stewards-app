import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type StarRating = 1 | 2 | 3 | 4 | 5

function normalizeRating(value: unknown): StarRating | null {
  if (value === null || typeof value === 'undefined') return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || Number.isNaN(n)) return null
  const rating = Math.round(n)
  return rating >= 1 && rating <= 5 ? (rating as StarRating) : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const body = await request.json()
    const inspectorId = typeof body.inspectorId === 'string' ? body.inspectorId.trim() : ''
    const ratingInput = normalizeRating(body.rating)

    if (!inspectorId) {
      return NextResponse.json({ error: 'Inspector ID is required' }, { status: 400 })
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, inspectorRatings: true },
    })

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    const inspectorExists = await prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { id: true },
    })

    if (!inspectorExists) {
      return NextResponse.json({ error: 'Inspector not found' }, { status: 404 })
    }

    const current = (contract.inspectorRatings as any) || {}
    if (!ratingInput) {
      if (current && typeof current === 'object') delete current[inspectorId]
      await prisma.contract.update({ where: { id: contractId }, data: { inspectorRatings: current as any } })
      return NextResponse.json({ inspectorId, rating: null })
    }

    const next = { ...(current && typeof current === 'object' ? current : {}), [inspectorId]: ratingInput }
    await prisma.contract.update({ where: { id: contractId }, data: { inspectorRatings: next as any } })

    const inspector = await prisma.inspector.findUnique({ where: { id: inspectorId }, select: { id: true, name: true, mobilePhone: true } })
    return NextResponse.json({ inspectorId, rating: ratingInput, inspector })
  } catch (error) {
    console.error('Failed to update inspector rating:', error)
    return NextResponse.json({ error: 'Failed to update inspector rating' }, { status: 500 })
  }
}
