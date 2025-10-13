import { NextRequest } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { cookies } from "next/headers"

import prisma from "@/lib/prisma"
import { sanitizeSegment } from "@/lib/filename"
import { getContractWithWorkOrders } from "@/app/api/contracts/[id]/report/contract-fetcher"
import { createContractReportBuffer } from "@/app/api/contracts/[id]/report/report-builder"
import { getAuthSecret } from "@/lib/auth-secret"
import { verifyJwt } from "@/lib/jwt"
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from "@/lib/s3-client"
import { Condition } from "@prisma/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function resolveCurrentUserId() {
  const secret = getAuthSecret()
  if (!secret) return null

  const sessionToken = (await cookies()).get("session")?.value
  if (!sessionToken) return null

  const payload = await verifyJwt<{ sub?: string }>(sessionToken, secret)
  return payload?.sub ?? null
}

function computeVersionIncrement(latest: { version: unknown } | null | undefined) {
  if (!latest) return "1.0"
  const numeric = Number(latest.version)
  if (!Number.isFinite(numeric)) return "1.0"
  return ((Math.round(numeric * 10) + 1) / 10).toFixed(1)
}

function buildStorageKey(contract: any, version: string) {
  const nameSegment = sanitizeSegment(contract.customer?.name) || "contract"
  const postalSegment = sanitizeSegment(contract.address?.postalCode) || contract.id.slice(-8)
  const folder = `${SPACE_DIRECTORY}/pdf/${nameSegment}-${postalSegment}`
  const versionSegment = version.replace(/\./g, "-")
  const fileName = `contract-${nameSegment}-${versionSegment}.pdf`
  return `${folder}/${fileName}`
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const reports = await prisma.contractReport.findMany({
    where: { contractId: id },
    orderBy: { generatedOn: "desc" },
    include: {
      generatedBy: {
        select: { id: true, username: true, email: true }
      }
    }
  })

  return new Response(JSON.stringify({ reports }), {
    headers: { "Content-Type": "application/json" }
  })
}

const CONDITION_VALUES = new Set(Object.values(Condition))

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as { title?: string; conditions?: unknown }
  const titleInput = typeof body.title === "string" ? body.title.trim() : ""

  const conditionsInput = Array.isArray(body.conditions)
    ? body.conditions
        .map((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
        .filter((value) => CONDITION_VALUES.has(value as Condition))
    : Array.from(CONDITION_VALUES)

  const allowedConditions = conditionsInput.length > 0
    ? Array.from(new Set(conditionsInput))
    : Array.from(CONDITION_VALUES)

  const contract = await getContractWithWorkOrders(id)
  if (!contract) {
    return new Response(JSON.stringify({ error: "Contract not found" }), { status: 404 })
  }

  if (!Array.isArray(contract.workOrders) || contract.workOrders.length === 0) {
    return new Response(JSON.stringify({ error: "No work orders linked to this contract" }), { status: 400 })
  }

  const latest = await prisma.contractReport.findFirst({
    where: { contractId: id },
    orderBy: { version: "desc" }
  })

  const nextVersion = computeVersionIncrement(latest)
  const generatedOn = new Date()
  const currentUserId = await resolveCurrentUserId()

  const title = titleInput.length ? titleInput : "Inspection Report"
  const versionLabel = `v${nextVersion}`

  const pdfBuffer = await createContractReportBuffer(contract, {
    titleOverride: title,
    versionLabel,
    generatedOn,
    allowedConditions,
    entryOnly: true,
  })

  const storageKey = buildStorageKey(contract, nextVersion)
  const fileUrl = `${PUBLIC_URL}/${storageKey}`

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    Body: pdfBuffer,
    ContentType: "application/pdf",
    ACL: "public-read"
  } as any))

  const report = await prisma.contractReport.create({
    data: {
      contractId: id,
      title,
      version: nextVersion,
      generatedOn,
      generatedById: currentUserId ?? undefined,
      storageKey,
      fileUrl,
      fileSizeBytes: pdfBuffer.length
    },
    include: {
      generatedBy: {
        select: { id: true, username: true, email: true }
      }
    }
  })

  return new Response(JSON.stringify({ report, fileUrl, version: nextVersion }), {
    headers: { "Content-Type": "application/json" }
  })
}
