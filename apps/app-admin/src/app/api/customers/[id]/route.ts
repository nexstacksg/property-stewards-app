import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { normalizePropertySize } from '@/lib/property-size'

// GET /api/customers/[id] - Get a single customer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: true,
        contracts: {
          include: {
            address: true,
            workOrders: {
              include: {
                inspectors: true
              }
            }
          },
          orderBy: { createdOn: 'desc' }
        }
      }
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}

// PATCH /api/customers/[id] - Update a customer
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      status
    } = body

    const customer = await prisma.customer.update({
      where: { id: id },
      data: {
        name,
        type,
        personInCharge,
        email,
        phone,
        isMember,
        memberSince: memberSince ? new Date(memberSince) : null,
        memberExpiredOn: memberExpiredOn ? new Date(memberExpiredOn) : null,
        memberTier,
        billingAddress,
        remarks,
        status
      },
      include: {
        addresses: true
      }
    })

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

// PUT /api/customers/[id] - Full update of customer with addresses
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json()
    const { 
      name, 
      type, 
      personInCharge, 
      email, 
      phone,
      billingAddress,
      isMember,
      memberTier,
      memberSince,
      memberExpiredOn,
      remarks,
      status,
      addresses,
      deletedAddressIds
    } = body

    // Use transaction to update customer and addresses
    let preparedAddresses: Array<any> | undefined
    try {
      if (Array.isArray(addresses)) {
        preparedAddresses = addresses.map((address: any, index: number) => {
          const hasSize = typeof address?.propertySize === 'string' && address.propertySize.trim().length > 0
          if (!hasSize) {
            throw new Error(`Address #${index + 1} is missing property size`)
          }

          return {
            ...address,
            normalizedSize: normalizePropertySize(address.propertyType, address.propertySize)
          }
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid property size'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const customer = await prisma.$transaction(async (tx) => {
      // Update customer
      const updatedCustomer = await tx.customer.update({
        where: { id: id },
        data: {
          name,
          type,
          personInCharge,
          email,
          phone,
          billingAddress,
          isMember,
          memberTier: isMember ? memberTier : null,
          memberSince: isMember && memberSince ? new Date(memberSince) : null,
          memberExpiredOn: isMember && memberExpiredOn ? new Date(memberExpiredOn) : null,
          remarks,
          status
        }
      })

      // Delete removed addresses (soft delete)
      if (deletedAddressIds && deletedAddressIds.length > 0) {
        await tx.customerAddress.updateMany({
          where: {
            id: { in: deletedAddressIds },
            customerId: id
          },
          data: { status: 'INACTIVE' }
        })
      }

      // Update or create addresses
      if (preparedAddresses && preparedAddresses.length > 0) {
        for (const address of preparedAddresses) {
          if (address.id) {
            // Update existing address
            await tx.customerAddress.update({
              where: { id: address.id },
              data: {
                address: address.address,
                postalCode: address.postalCode,
                propertyType: address.propertyType,
                propertySize: address.normalizedSize,
                propertySizeRange: address.propertySizeRange || null,
                relationship: address.relationship || null,
                remarks: address.remarks,
                status: address.status || 'ACTIVE'
              }
            })
          } else {
            // Create new address
            await tx.customerAddress.create({
              data: {
                customerId: id,
                address: address.address,
                postalCode: address.postalCode,
                propertyType: address.propertyType,
                propertySize: address.normalizedSize,
                propertySizeRange: address.propertySizeRange || null,
                relationship: address.relationship || null,
                remarks: address.remarks,
                status: 'ACTIVE'
              }
            })
          }
        }
      }

      // Return updated customer with addresses
      return await tx.customer.findUnique({
        where: { id: id },
        include: {
          addresses: {
            where: { status: 'ACTIVE' },
            orderBy: { createdOn: 'desc' }
          }
        }
      })
    })

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers/[id] - Delete a customer (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Check if customer has contracts
    const contractCount = await prisma.contract.count({
      where: { customerId: id }
    })

    if (contractCount > 0) {
      // Soft delete - mark as inactive
      const customer = await prisma.customer.update({
        where: { id: id },
        data: { status: 'INACTIVE' }
      })
      
      return NextResponse.json({ 
        message: 'Customer marked as inactive due to existing contracts',
        customer 
      })
    } else {
      // Hard delete if no contracts
      await prisma.customer.delete({
        where: { id: id }
      })
      
      return NextResponse.json({ 
        message: 'Customer deleted successfully' 
      })
    }
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    )
  }
}
