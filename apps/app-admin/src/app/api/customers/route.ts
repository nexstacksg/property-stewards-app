import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/customers - Get all customers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}
    
    if (status) {
      where.status = status
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { personInCharge: { contains: search, mode: 'insensitive' } }
      ]
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          addresses: true,
          _count: {
            select: {
              contracts: true
            }
          }
        },
        orderBy: { createdOn: 'desc' },
        skip,
        take: limit
      }),
      prisma.customer.count({ where })
    ])

    return NextResponse.json({
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create a new customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      name,
      type,
      personInCharge,
      email,
      phone,
      isMember,
      memberSince,
      memberExpiredOn,
      memberTier,
      billingAddress,
      remarks,
      addresses
    } = body

    // Validate required fields
    if (!name || !type || !personInCharge || !email || !phone || !billingAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create customer with addresses if provided
    const customer = await prisma.customer.create({
      data: {
        name,
        type,
        personInCharge,
        email,
        phone,
        isMember: isMember || false,
        memberSince: memberSince ? new Date(memberSince) : null,
        memberExpiredOn: memberExpiredOn ? new Date(memberExpiredOn) : null,
        memberTier,
        billingAddress,
        remarks,
        addresses: addresses ? {
          create: addresses.map((addr: any) => ({
            address: addr.address,
            postalCode: addr.postalCode,
            propertyType: addr.propertyType,
            propertySize: addr.propertySize,
            remarks: addr.remarks
          }))
        } : undefined
      },
      include: {
        addresses: true
      }
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    )
  }
}