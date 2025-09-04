import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// PATCH /api/customer-addresses/[id] - Update a customer address
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json()
    
    const {
      address,
      postalCode,
      propertyType,
      propertySize,
      remarks,
      status
    } = body

    const customerAddress = await prisma.customerAddress.update({
      where: { id },
      data: {
        address,
        postalCode,
        propertyType,
        propertySize,
        remarks,
        status
      }
    })

    return NextResponse.json(customerAddress)
  } catch (error) {
    console.error('Error updating customer address:', error)
    return NextResponse.json(
      { error: 'Failed to update customer address' },
      { status: 500 }
    )
  }
}

// DELETE /api/customer-addresses/[id] - Delete a customer address
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Check if address has contracts
    const contractCount = await prisma.contract.count({
      where: { addressId: id }
    })

    if (contractCount > 0) {
      // Soft delete - mark as inactive
      const address = await prisma.customerAddress.update({
        where: { id: id },
        data: { status: 'INACTIVE' }
      })
      
      return NextResponse.json({ 
        message: 'Address marked as inactive due to existing contracts',
        address 
      })
    } else {
      // Hard delete if no contracts
      await prisma.customerAddress.delete({
        where: { id: id }
      })
      
      return NextResponse.json({ 
        message: 'Address deleted successfully' 
      })
    }
  } catch (error) {
    console.error('Error deleting customer address:', error)
    return NextResponse.json(
      { error: 'Failed to delete customer address' },
      { status: 500 }
    )
  }
}