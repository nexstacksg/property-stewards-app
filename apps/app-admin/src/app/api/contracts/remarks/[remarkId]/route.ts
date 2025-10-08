import { NextRequest, NextResponse } from "next/server"
import { ContractRemarkStatus } from "@prisma/client"

import prisma from "@/lib/prisma"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ remarkId: string }> },
) {
  try {
    const { remarkId } = await context.params
    const payload = await request.json().catch(() => null) as { status?: ContractRemarkStatus } | null
    const status = payload?.status

    if (!status || !Object.values(ContractRemarkStatus).includes(status)) {
      return NextResponse.json(
        { error: "Valid status is required" },
        { status: 400 },
      )
    }

    const remark = await prisma.contractRemark.findUnique({ where: { id: remarkId } })

    if (!remark) {
      return NextResponse.json(
        { error: "Remark not found" },
        { status: 404 },
      )
    }

    const updated = await prisma.contractRemark.update({
      where: { id: remarkId },
      data: { status },
      include: {
        createdBy: {
          select: { id: true, username: true, email: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating contract remark status:", error)
    return NextResponse.json(
      { error: "Failed to update contract remark" },
      { status: 500 },
    )
  }
}
