import { NextRequest, NextResponse } from "next/server"
import { ContractRemarkStatus } from "@prisma/client"

import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

function parseStatuses(input?: string | null): ContractRemarkStatus[] {
  if (!input || input.toUpperCase() === "ALL") {
    return [ContractRemarkStatus.OPEN, ContractRemarkStatus.COMPLETED]
  }
  const parts = input
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const allowed = new Set(Object.values(ContractRemarkStatus))
  const filtered = parts.filter((s): s is ContractRemarkStatus => allowed.has(s as ContractRemarkStatus))
  return filtered.length ? filtered : [ContractRemarkStatus.OPEN]
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10))
    const statuses = parseStatuses(searchParams.get("status"))

    const where: any = { status: { in: statuses } }

    const [total, items] = await Promise.all([
      prisma.contractRemark.count({ where }),
      prisma.contractRemark.findMany({
        where,
        orderBy: { createdOn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contract: {
            select: {
              id: true,
              customer: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, username: true, email: true } },
        },
      }),
    ])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    const remarks = items.map((remark) => ({
      id: remark.id,
      body: remark.body,
      createdOn: remark.createdOn.toISOString(),
      type: remark.type,
      status: remark.status,
      contractId: remark.contractId,
      contract: {
        id: remark.contract?.id,
        customer: remark.contract?.customer || null,
      },
      createdBy: remark.createdBy,
    }))

    // Also return open/completed counts for quick badges
    const [openCount, completedCount] = await Promise.all([
      prisma.contractRemark.count({ where: { status: ContractRemarkStatus.OPEN } }),
      prisma.contractRemark.count({ where: { status: ContractRemarkStatus.COMPLETED } }),
    ])

    return NextResponse.json({
      remarks,
      pagination: { page, limit, total, totalPages },
      counts: { open: openCount, completed: completedCount },
    })
  } catch (error) {
    console.error("Error listing remarks:", error)
    return NextResponse.json({ error: "Failed to list remarks" }, { status: 500 })
  }
}

