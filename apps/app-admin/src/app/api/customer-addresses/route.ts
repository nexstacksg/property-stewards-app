import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST /api/customer-addresses - Create a new address for a customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      customerId,
      address,
      postalCode,
      propertyType,
      propertySize,
      remarks
    } = body

    // Validate required fields
    if (!customerId || !address || !postalCode || !propertyType || !propertySize) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    const customerAddress = await prisma.customerAddress.create({
      data: {
        customerId,
        address,
        postalCode,
        propertyType,
        propertySize,
        remarks
      }
    })

    return NextResponse.json(customerAddress, { status: 201 })
  } catch (error) {
    console.error('Error creating customer address:', error)
    return NextResponse.json(
      { error: 'Failed to create customer address' },
      { status: 500 }
    )
  }
}