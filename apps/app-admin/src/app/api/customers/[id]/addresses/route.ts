import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { normalizePropertySize } from "@/lib/property-size"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id }
    })

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      )
    }

    // Create the address
    let normalizedSize: string
    try {
      normalizedSize = normalizePropertySize(body.propertyType, body.propertySize)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid property size'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const address = await prisma.customerAddress.create({
      data: {
        customerId: id,
        address: body.address,
        postalCode: body.postalCode,
        propertyType: body.propertyType,
        propertySize: normalizedSize,
        remarks: body.remarks || null,
        status: "ACTIVE"
      }
    })

    return NextResponse.json(address)
  } catch (error) {
    console.error("Error creating address:", error)
    return NextResponse.json(
      { error: "Failed to create address" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: id },
      orderBy: { createdOn: 'desc' }
    })

    return NextResponse.json(addresses)
  } catch (error) {
    console.error("Error fetching addresses:", error)
    return NextResponse.json(
      { error: "Failed to fetch addresses" },
      { status: 500 }
    )
  }
}
