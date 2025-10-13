import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const tag = await prisma.checklistTag.findUnique({ where: { id } })
    if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(tag)
  } catch (error) {
    console.error("GET checklist tag failed:", error)
    return NextResponse.json({ error: "Failed to load tag" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as { label?: string; taskTemplates?: any } | null
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

    const data: { label?: string; taskTemplates?: any } = {}
    if (typeof body.label === "string") {
      const trimmed = body.label.trim()
      if (!trimmed) return NextResponse.json({ error: "Label is required" }, { status: 400 })
      data.label = trimmed.replace(/\s+/g, " ")
    }
    if (Array.isArray(body.taskTemplates)) {
      data.taskTemplates = body.taskTemplates
    }

    const updated = await prisma.checklistTag.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A tag with this label already exists" }, { status: 409 })
    }
    console.error("PATCH checklist tag failed:", error)
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.checklistTag.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("DELETE checklist tag failed:", error)
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 })
  }
}

