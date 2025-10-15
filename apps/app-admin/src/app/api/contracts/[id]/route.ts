import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/prisma'

// GET /api/contracts/[id] - Get a single contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    let contract = await prisma.contract.findUnique({
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
        marketingSource: true,
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

    // Transform inspectorRatings (JSON map) into array with inspector details to keep API shape stable
    try {
      const ratingsJson = (contract as any).inspectorRatings as Record<string, number> | null | undefined
      if (ratingsJson && typeof ratingsJson === 'object') {
        const inspectorIds = Object.keys(ratingsJson).filter(Boolean)
        const inspectors = inspectorIds.length > 0 ? await prisma.inspector.findMany({
          where: { id: { in: inspectorIds } },
          select: { id: true, name: true, mobilePhone: true }
        }) : []
        const inspectorMap = new Map(inspectors.map(i => [i.id, i]))
        const normalized = inspectorIds.map((inspectorId) => {
          const raw = (ratingsJson as any)[inspectorId]
          let rating: number | null = null
          if (typeof raw === 'number') {
            rating = Math.max(1, Math.min(5, Math.round(raw)))
          } else if (typeof raw === 'string') {
            const v = raw.trim().toUpperCase()
            if (v === 'GOOD') rating = 5
            else if (v === 'FAIR') rating = 3
            else if (v === 'BAD') rating = 1
            else {
              const n = Number(v)
              rating = Number.isNaN(n) ? null : Math.max(1, Math.min(5, Math.round(n)))
            }
          }
          return {
            inspectorId,
            rating,
            inspector: inspectorMap.get(inspectorId) || null,
          }
        })
        ;(contract as any).inspectorRatings = normalized
      }
    } catch (e) {
      console.error('Failed to normalize inspectorRatings JSON', e)
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
      marketingSourceId,
      referenceIds,
      contactPersons
    } = body

    const normalizedContractType = contractType === 'INSPECTION' || contractType === 'REPAIR'
      ? contractType
      : undefined

    let normalizedMarketingSourceId: string | null | undefined = undefined
    if (marketingSourceId === null) {
      normalizedMarketingSourceId = null
    } else if (typeof marketingSourceId === 'string' && marketingSourceId.trim().length > 0) {
      const ms = await prisma.marketingSource.findUnique({ where: { id: marketingSourceId } })
      normalizedMarketingSourceId = ms ? ms.id : null
    }

    const sanitizedReferenceIds = Array.isArray(referenceIds)
      ? referenceIds.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined

    const sanitizedContactPersons = Array.isArray(contactPersons)
      ? contactPersons.filter((person: any) => person && typeof person.name === 'string' && person.name.trim().length > 0)
        .map((person: any) => ({
          id: typeof person.id === 'string' && person.id.trim().length > 0 ? person.id.trim() : crypto.randomUUID(),
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
        marketingSourceId: normalizedMarketingSourceId,
        referenceIds: sanitizedReferenceIds,
        contactPersons: Array.isArray(sanitizedContactPersons) ? (sanitizedContactPersons as any) : undefined,
      },
      include: {
        customer: true,
        address: true,
        workOrders: true
      }
    })

    const refreshedContract = await prisma.contract.findUnique({
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
        marketingSource: true,
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
