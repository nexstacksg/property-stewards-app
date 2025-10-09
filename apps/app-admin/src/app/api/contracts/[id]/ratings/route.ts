import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { InspectorContractRatingValue } from '@prisma/client'

const ALLOWED_RATINGS: InspectorContractRatingValue[] = ['GOOD', 'FAIR', 'BAD']

function normalizeRating(value: unknown): InspectorContractRatingValue | null {
  if (value === null || typeof value === 'undefined') return null
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return (ALLOWED_RATINGS as string[]).includes(normalized)
    ? (normalized as InspectorContractRatingValue)
    : null
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

    const contractExists = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    })

    if (!contractExists) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    const inspectorExists = await prisma.inspector.findUnique({
      where: { id: inspectorId },
      select: { id: true },
    })

    if (!inspectorExists) {
      return NextResponse.json({ error: 'Inspector not found' }, { status: 404 })
    }

    const compositeKey = {
      inspectorId_contractId: {
        inspectorId,
        contractId,
      },
    }

    if (!ratingInput) {
      await prisma.inspectorContractRating.delete({ where: compositeKey }).catch(() => undefined)
      return NextResponse.json({ inspectorId, rating: null })
    }

    const updated = await prisma.inspectorContractRating.upsert({
      where: compositeKey,
      update: { rating: ratingInput },
      create: {
        inspectorId,
        contractId,
        rating: ratingInput,
      },
      include: {
        inspector: {
          select: {
            id: true,
            name: true,
            mobilePhone: true,
          },
        },
      },
    })

    return NextResponse.json({
      inspectorId,
      rating: updated.rating,
      inspector: updated.inspector,
    })
  } catch (error) {
    console.error('Failed to update inspector rating:', error)
    return NextResponse.json({ error: 'Failed to update inspector rating' }, { status: 500 })
  }
}
