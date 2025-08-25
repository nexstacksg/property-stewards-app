import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST /api/contracts/[id]/checklist - Add a checklist to a contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const body = await request.json()
    const { templateId } = body

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      )
    }

    // Check if contract exists and doesn't already have a checklist
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { contractChecklist: true }
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    if (contract.contractChecklist) {
      return NextResponse.json(
        { error: 'Contract already has a checklist' },
        { status: 400 }
      )
    }

    // Get the template
    const template = await prisma.checklist.findUnique({
      where: { id: templateId },
      include: { items: true }
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Create the checklist in a transaction
    const contractChecklist = await prisma.$transaction(async (tx) => {
      // Update contract with template reference
      await tx.contract.update({
        where: { id: contractId },
        data: { basedOnChecklistId: templateId }
      })

      // Create contract checklist
      const checklist = await tx.contractChecklist.create({
        data: {
          contractId
        }
      })

      // Create checklist items from template
      if (template.items && template.items.length > 0) {
        await tx.contractChecklistItem.createMany({
          data: template.items.map(item => ({
            contractChecklistId: checklist.id,
            name: item.name,
            order: item.order,
            remarks: item.action
          }))
        })
      }

      return await tx.contractChecklist.findUnique({
        where: { id: checklist.id },
        include: {
          items: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })

    return NextResponse.json(contractChecklist, { status: 201 })
  } catch (error) {
    console.error('Error adding checklist to contract:', error)
    return NextResponse.json(
      { error: 'Failed to add checklist' },
      { status: 500 }
    )
  }
}