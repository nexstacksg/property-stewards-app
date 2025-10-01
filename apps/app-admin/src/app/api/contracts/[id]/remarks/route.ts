import { NextRequest, NextResponse } from "next/server"

import prisma from "@/lib/prisma"
import { getAuthSecret } from "@/lib/auth-secret"
import { verifyJwt } from "@/lib/jwt"

async function resolveSessionUserId(request: NextRequest) {
  const token = request.cookies.get("session")?.value
  if (!token) return null
  const secret = getAuthSecret()
  if (!secret) return null
  try {
    const payload = await verifyJwt<{ sub?: string }>(token, secret)
    return payload?.sub ?? null
  } catch (error) {
    console.debug("Unable to resolve session user for contract remark", error)
    return null
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const remarks = await prisma.contractRemark.findMany({
      where: { contractId: id },
      orderBy: { createdOn: "desc" },
      include: {
        createdBy: {
          select: { id: true, username: true, email: true },
        },
      },
    })

    return NextResponse.json({ remarks })
  } catch (error) {
    console.error("Error fetching contract remarks:", error)
    return NextResponse.json(
      { error: "Failed to fetch contract remarks" },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const contract = await prisma.contract.findUnique({ where: { id } })
    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 },
      )
    }

    const payload = await request.json().catch(() => null) as { body?: string } | null
    const text = payload?.body?.trim()

    if (!text) {
      return NextResponse.json(
        { error: "Remark text is required" },
        { status: 400 },
      )
    }

    const userId = await resolveSessionUserId(request)

    const remark = await prisma.contractRemark.create({
      data: {
        contractId: id,
        body: text,
        createdById: userId ?? undefined,
      },
      include: {
        createdBy: {
          select: { id: true, username: true, email: true },
        },
      },
    })

    return NextResponse.json(remark, { status: 201 })
  } catch (error) {
    console.error("Error creating contract remark:", error)
    return NextResponse.json(
      { error: "Failed to create contract remark" },
      { status: 500 },
    )
  }
}
