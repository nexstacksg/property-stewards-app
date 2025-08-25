import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/contracts - Get all contracts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}
    
    // Handle multiple statuses (comma-separated)
    if (status) {
      if (status.includes(',')) {
        where.status = { in: status.split(',') }
      } else {
        where.status = status
      }
    }
    
    if (customerId) {
      where.customerId = customerId
    }
    
    // Handle search - search in customer name or contract ID
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { address: { address: { contains: search, mode: 'insensitive' } } }
      ]
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: {
          customer: true,
          address: true,
          basedOnChecklist: true,
          workOrders: {
            include: {
              inspector: true
            }
          }
        },
        orderBy: { createdOn: 'desc' },
        skip,
        take: limit
      }),
      prisma.contract.count({ where })
    ])

    return NextResponse.json({
      contracts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching contracts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    )
  }
}

// POST /api/contracts - Create a new contract
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      customerId,
      addressId,
      value,
      firstPaymentOn,
      finalPaymentOn,
      basedOnChecklistId,
      scheduledStartDate,
      scheduledEndDate,
      servicePackage,
      remarks
    } = body

    // Validate required fields
    if (!customerId || !addressId || !value || !firstPaymentOn || !scheduledStartDate || !scheduledEndDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify customer and address exist
    const [customer, address] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.customerAddress.findUnique({ where: { id: addressId } })
    ])

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    if (!address || address.customerId !== customerId) {
      return NextResponse.json(
        { error: 'Address not found or does not belong to customer' },
        { status: 404 }
      )
    }

    // Create contract
    const contract = await prisma.contract.create({
      data: {
        customerId,
        addressId,
        value,
        firstPaymentOn: new Date(firstPaymentOn),
        finalPaymentOn: finalPaymentOn ? new Date(finalPaymentOn) : null,
        basedOnChecklistId,
        scheduledStartDate: new Date(scheduledStartDate),
        scheduledEndDate: new Date(scheduledEndDate),
        servicePackage,
        remarks,
        status: 'DRAFT'
      },
      include: {
        customer: true,
        address: true,
        basedOnChecklist: true
      }
    })

    // If a checklist template is specified, create contract checklist
    if (basedOnChecklistId) {
      const checklistTemplate = await prisma.checklist.findUnique({
        where: { id: basedOnChecklistId },
        include: { items: true }
      })

      if (checklistTemplate) {
        await prisma.contractChecklist.create({
          data: {
            contractId: contract.id,
            items: {
              create: checklistTemplate.items.map(item => ({
                name: item.name,
                order: item.order
              }))
            }
          }
        })
      }
    }

    return NextResponse.json(contract, { status: 201 })
  } catch (error) {
    console.error('Error creating contract:', error)
    return NextResponse.json(
      { error: 'Failed to create contract' },
      { status: 500 }
    )
  }
}