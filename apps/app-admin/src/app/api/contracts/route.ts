import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { generateContractId } from '@/lib/id-generator'

const MAX_TRANSACTION_ATTEMPTS = 3

const isRetryableTransactionError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'

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
          contactPersons: true,
          marketingSource: true,
          workOrders: {
            include: {
              inspectors: true
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
      remarks,
      contractType,
      marketingSourceId,
      referenceIds,
      contactPersons
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
    const normalizedContractType = contractType === 'REPAIR' ? 'REPAIR' : 'INSPECTION'

    let normalizedMarketingSourceId: string | null = null
    if (typeof marketingSourceId === 'string' && marketingSourceId.trim().length > 0) {
      const ms = await prisma.marketingSource.findUnique({ where: { id: marketingSourceId } })
      normalizedMarketingSourceId = ms ? ms.id : null
    }

    const sanitizedReferenceIds = Array.isArray(referenceIds)
      ? referenceIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : []

    const sanitizedContactPersons = Array.isArray(contactPersons)
      ? contactPersons
          .filter((person: any) => person && typeof person.name === 'string' && person.name.trim().length > 0)
          .map((person: any) => ({
            name: person.name.trim(),
            phone: typeof person.phone === 'string' && person.phone.trim().length > 0 ? person.phone.trim() : undefined,
            email: typeof person.email === 'string' && person.email.trim().length > 0 ? person.email.trim() : undefined,
            relation: typeof person.relation === 'string' && person.relation.trim().length > 0 ? person.relation.trim() : undefined
          }))
      : []

    const baseContractData = {
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
      contractType: normalizedContractType,
      marketingSourceId: normalizedMarketingSourceId ?? undefined,
      referenceIds: sanitizedReferenceIds,
      status: 'DRAFT' as const,
      contactPersons: sanitizedContactPersons.length > 0
        ? {
            create: sanitizedContactPersons
          }
        : undefined
    }

    const contractInclude = {
      customer: true,
      address: true,
      basedOnChecklist: true,
      contactPersons: true
    }

    let contract: Awaited<ReturnType<typeof prisma.contract.create>> | null = null

    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        contract = await prisma.$transaction(
          async (tx) => {
            const generatedId = await generateContractId(tx)
            return tx.contract.create({
              data: {
                ...baseContractData,
                id: generatedId,
              },
              include: contractInclude,
            })
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
        break
      } catch (transactionError) {
        if (isRetryableTransactionError(transactionError) && attempt < MAX_TRANSACTION_ATTEMPTS - 1) {
          continue
        }
        throw transactionError
      }
    }

    if (!contract) {
      throw new Error('Unable to create contract after retrying transaction')
    }

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
