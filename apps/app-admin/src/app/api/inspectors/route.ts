import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { summarizeRatings } from '@/lib/rating-utils'

// GET /api/inspectors - Get all inspectors
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const search = searchParams.get('search')
    const limit = searchParams.get('limit')
    const page = searchParams.get('page')

    const where: any = {}
    
    if (status) {
      where.status = status
    }
    
    if (type) {
      where.type = type
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { mobilePhone: { contains: search } }
      ]
    }

    const take = limit ? parseInt(limit) : undefined
    const skip = page && limit ? (parseInt(page) - 1) * parseInt(limit) : 0

    const [inspectors, total] = await Promise.all([
      prisma.inspector.findMany({
        where,
        include: {
          _count: {
            select: {
              workOrders: true
            }
          },
        },
        orderBy: { createdOn: 'desc' },
        take,
        skip
      }),
      prisma.inspector.count({ where })
    ])

    // Compute rating summary from Contract.inspectorRatings JSON for the current page of inspectors
    const enrichedInspectors = [] as any[]
    for (const inspector of inspectors as any[]) {
      const contracts = await prisma.contract.findMany({
        where: {
          workOrders: { some: { inspectors: { some: { id: inspector.id } } } },
        },
        select: { inspectorRatings: true },
      })
      const ratingsArray = [] as { rating: any }[]
      for (const c of contracts) {
        const map = (c as any).inspectorRatings as Record<string, number> | null | undefined
        const value = map && typeof map === 'object' ? map[inspector.id] : null
        if (value) ratingsArray.push({ rating: value })
      }
      const ratingSummary = summarizeRatings(ratingsArray)
      enrichedInspectors.push({
        ...(inspector as any),
        ratingAverage: ratingSummary.average,
        ratingCount: ratingSummary.count,
      })
    }

    return NextResponse.json({ 
      inspectors: enrichedInspectors,
      total,
      page: page ? parseInt(page) : 1,
      limit: take
    })
  } catch (error) {
    console.error('Error fetching inspectors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inspectors' },
      { status: 500 }
    )
  }
}

// POST /api/inspectors - Create a new inspector
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      name,
      mobilePhone,
      type,
      specialization,
      remarks
    } = body

    console.log('Creating inspector with:', { name, mobilePhone, type, specialization, remarks })

    // Validate required fields
    if (!name || !mobilePhone || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if mobile phone already exists
    const existing = await prisma.inspector.findUnique({
      where: { mobilePhone }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Mobile phone number already registered' },
        { status: 400 }
      )
    }

    const inspector = await prisma.inspector.create({
      data: {
        name,
        mobilePhone,
        type,
        specialization: typeof specialization === 'string'
          ? specialization
          : null,
        remarks
      }
    })

    console.log('Created inspector:', inspector)

    return NextResponse.json(inspector, { status: 201 })
  } catch (error) {
    console.error('Error creating inspector:', error)
    return NextResponse.json(
      { error: 'Failed to create inspector' },
      { status: 500 }
    )
  }
}
