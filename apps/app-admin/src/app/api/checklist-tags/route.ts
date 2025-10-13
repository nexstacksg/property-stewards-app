import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")?.trim() ?? ""
    const limitParam = searchParams.get("limit")
    const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200)

    const tags = await prisma.checklistTag.findMany({
      where: query
        ? {
            label: {
              contains: query,
              mode: "insensitive",
            },
          }
        : undefined,
      orderBy: [{ label: "asc" }],
      take: limit,
    })

    return NextResponse.json({ tags })
  } catch (error) {
    console.error("Error fetching checklist tags:", error)
    return NextResponse.json(
      { error: "Failed to fetch checklist tags" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { label?: string; taskTemplates?: any } | null
    const rawLabel = body?.label ?? ""
    const trimmed = rawLabel.trim()

    if (!trimmed) {
      return NextResponse.json(
        { error: "Tag label is required" },
        { status: 400 },
      )
    }

    const normalizedLabel = trimmed.replace(/\s+/g, " ")
    const taskTemplates = Array.isArray(body?.taskTemplates) ? body!.taskTemplates : undefined

    const tag = await prisma.checklistTag.upsert({
      where: { label: normalizedLabel },
      update: { updatedOn: new Date(), taskTemplates: taskTemplates ?? undefined },
      create: { label: normalizedLabel, taskTemplates: taskTemplates ?? undefined },
    })

    return NextResponse.json(tag, { status: 201 })
  } catch (error: unknown) {
    console.error("Error creating checklist tag:", error)
    return NextResponse.json(
      { error: "Failed to create checklist tag" },
      { status: 500 },
    )
  }
}
