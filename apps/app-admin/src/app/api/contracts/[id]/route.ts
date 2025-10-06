import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/contracts/[id] - Get a single contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        address: true,
        basedOnChecklist: {
          include: { items: true }
        },
        contractChecklist: {
          include: {
            items: {
              include: {
                enteredBy: true,
                workOrder: true,
                locations: {
                  orderBy: { order: 'asc' },
                  include: {
                    tasks: {
                      orderBy: { createdOn: 'asc' }
                    }
                  }
                },
                checklistTasks: {
                  orderBy: { createdOn: 'asc' },
                  include: {
                    location: true,
                  }
                }
              },
              orderBy: { order: 'asc' }
            }
          }
        },
        contactPersons: true,
        workOrders: {
          include: {
            inspectors: true
          },
          orderBy: { scheduledStartDateTime: 'desc' }
        },
        followUpRemarks: {
          include: {
            createdBy: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          },
          orderBy: { createdOn: 'desc' }
        }
      }
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error fetching contract:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    )
  }
}

// PATCH /api/contracts/[id] - Update a contract
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const {
      value,
      firstPaymentOn,
      finalPaymentOn,
      scheduledStartDate,
      scheduledEndDate,
      actualStartDate,
      actualEndDate,
      servicePackage,
      remarks,
      contractType,
      customerComments,
      customerRating,
      status,
      marketingSource,
      referenceIds,
      contactPersons
    } = body

    const normalizedContractType = contractType === 'INSPECTION' || contractType === 'REPAIR'
      ? contractType
      : undefined

    const normalizedMarketingSource = marketingSource && ['GOOGLE', 'REFERRAL', 'OTHERS'].includes(marketingSource)
      ? marketingSource
      : marketingSource === null
        ? null
        : undefined

    const sanitizedReferenceIds = Array.isArray(referenceIds)
      ? referenceIds.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined

    const sanitizedContactPersons = Array.isArray(contactPersons)
      ? contactPersons.filter((person: any) => person && typeof person.name === 'string' && person.name.trim().length > 0)
        .map((person: any) => ({
          name: person.name.trim(),
          phone: typeof person.phone === 'string' && person.phone.trim().length > 0 ? person.phone.trim() : undefined,
          email: typeof person.email === 'string' && person.email.trim().length > 0 ? person.email.trim() : undefined,
          relation: typeof person.relation === 'string' && person.relation.trim().length > 0 ? person.relation.trim() : undefined
        }))
      : undefined

    const contract = await prisma.contract.update({
      where: { id },
      data: {
        value,
        firstPaymentOn: firstPaymentOn ? new Date(firstPaymentOn) : undefined,
        finalPaymentOn: finalPaymentOn ? new Date(finalPaymentOn) : null,
        scheduledStartDate: scheduledStartDate ? new Date(scheduledStartDate) : undefined,
        scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : undefined,
        actualStartDate: actualStartDate ? new Date(actualStartDate) : null,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null,
        servicePackage,
        remarks,
        contractType: normalizedContractType,
        customerComments,
        customerRating,
        status,
        marketingSource: normalizedMarketingSource,
        referenceIds: sanitizedReferenceIds,
      },
      include: {
        customer: true,
        address: true,
        contactPersons: true,
        workOrders: true
      }
    })

    if (sanitizedContactPersons) {
      await prisma.contractContactPerson.deleteMany({ where: { contractId: id } })
      if (sanitizedContactPersons.length > 0) {
        await prisma.contractContactPerson.createMany({
          data: sanitizedContactPersons.map(person => ({ ...person, contractId: id }))
        })
      }
    }

    const refreshedContract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        address: true,
        contactPersons: true,
        basedOnChecklist: {
          include: { items: true }
        },
        contractChecklist: {
          include: {
            items: {
              include: {
                enteredBy: true,
                workOrder: true
              },
              orderBy: { order: 'asc' }
            }
          }
        },
        workOrders: {
          include: {
            inspectors: true
          },
          orderBy: { scheduledStartDateTime: 'desc' }
        },
        followUpRemarks: {
          include: {
            createdBy: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          },
          orderBy: { createdOn: 'desc' }
        }
      }
    })

    return NextResponse.json(refreshedContract)
  } catch (error) {
    console.error('Error updating contract:', error)
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    )
  }
}

// PUT is an alias for PATCH
export const PUT = PATCH

// DELETE /api/contracts/[id] - Delete a contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Check if contract has work orders
    const workOrderCount = await prisma.workOrder.count({
      where: { contractId: id }
    })

    if (workOrderCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete contract with existing work orders' },
        { status: 400 }
      )
    }

    // Delete contract and related data
    await prisma.$transaction([
      prisma.contractChecklistItem.deleteMany({
        where: {
          contractChecklist: {
            contractId: id
          }
        }
      }),
      prisma.contractChecklist.deleteMany({
        where: { contractId: id }
      }),
      prisma.contract.delete({
        where: { id }
      })
    ])

    return NextResponse.json({ 
      message: 'Contract deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting contract:', error)
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    )
  }
}
