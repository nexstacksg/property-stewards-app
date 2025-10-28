import { NextRequest } from "next/server"
import { CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import prisma from "@/lib/prisma"
import { sanitizeSegment } from "@/lib/filename"
import { getContractWithWorkOrders } from "@/app/api/contracts/[id]/report/contract-fetcher"
import { getAuthSecret } from "@/lib/auth-secret"
import { verifyJwt } from "@/lib/jwt"
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from "@/lib/s3-client"
import { Condition } from "@prisma/client"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

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

function buildFolder(contract: any) {
  const nameSegment = sanitizeSegment(contract.customer?.name) || "contract"
  const postalSegment = sanitizeSegment(contract.address?.postalCode) || contract.id.slice(-8)
  return `${SPACE_DIRECTORY}/pdf/${nameSegment}-${postalSegment}`
}

function buildPreviewKey(contract: any) {
  const folder = buildFolder(contract)
  const nameSegment = sanitizeSegment(contract.customer?.name) || "contract"
  return `${folder}/contract-${nameSegment}-preview.pdf`
}

function buildVersionedKey(contract: any, version: string) {
  const nameSegment = sanitizeSegment(contract.customer?.name) || "contract"
  const postalSegment = sanitizeSegment(contract.address?.postalCode) || contract.id.slice(-8)
  const folder = `${SPACE_DIRECTORY}/pdf/${nameSegment}-${postalSegment}`
  const versionSegment = version.replace(/\./g, "-")
  const fileName = `contract-${nameSegment}-${versionSegment}.pdf`
  return `${folder}/${fileName}`
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as { title?: string; conditions?: unknown; entryOnly?: boolean }
  const titleInput = typeof body.title === "string" ? body.title.trim() : ""
  const entryOnly = body.entryOnly !== false // default true

  // Normalize conditions (must match preview build)
  const allConditions = new Set(Object.values(Condition))
  const conditionsInput = Array.isArray(body.conditions)
    ? body.conditions
        .map(v => (typeof v === 'string' ? v.trim().toUpperCase() : ''))
        .filter(v => allConditions.has(v as Condition))
    : Array.from(allConditions)
  const allowedConditions = conditionsInput.length > 0 ? Array.from(new Set(conditionsInput)) : Array.from(allConditions)

  const contract = await getContractWithWorkOrders(id)
  if (!contract) {
    return new Response(JSON.stringify({ error: "Contract not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  if (!Array.isArray(contract.workOrders) || contract.workOrders.length === 0) {
    return new Response(JSON.stringify({ error: "No work orders linked to this contract" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  // Compute a lightweight data signature to validate that the preview matches current data + filters
  const timestamps: number[] = []
  const pushDate = (value?: any) => {
    if (!value) return
    const n = new Date(value).getTime()
    if (Number.isFinite(n)) timestamps.push(n)
  }
  pushDate(contract.updatedOn)
  if (Array.isArray(contract.workOrders)) contract.workOrders.forEach((w: any) => pushDate(w.updatedOn))
  const cl = contract.contractChecklist
  if (cl) pushDate(cl.updatedOn)
  const items = cl?.items || []
  items.forEach((it: any) => {
    if (Array.isArray(it.contributions)) it.contributions.forEach((e: any) => { pushDate(e.updatedOn); pushDate(e.createdOn) })
    if (Array.isArray(it.checklistTasks)) it.checklistTasks.forEach((t: any) => {
      pushDate(t.updatedOn); pushDate(t.createdOn)
      if (Array.isArray(t.entries)) t.entries.forEach((e: any) => { pushDate(e.updatedOn); pushDate(e.createdOn) })
    })
    if (Array.isArray(it.locations)) it.locations.forEach((loc: any) => { pushDate(loc.updatedOn); pushDate(loc.createdOn) })
  })
  const dataEpoch = timestamps.length ? Math.max(...timestamps) : new Date(contract.createdOn || Date.now()).getTime()
  const condSig = allowedConditions.slice().sort().join('|')
  const normalizedTitle = (titleInput || '').trim()
  const versionLabel = 'v0.0 (Preview)'
  const workOrderId = null
  const expectedSignature = `${contract.id}:${dataEpoch}:${versionLabel}:${normalizedTitle}:${workOrderId || 'all'}:${entryOnly ? 'entry' : 'full'}:${condSig}`

  // Ensure preview file exists and, if possible, matches our signature
  const previewKey = buildPreviewKey(contract)
  try {
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: previewKey } as any))
    const meta = (head as any)?.Metadata || {}
    const storedSig = meta['preview-etag'] || meta['preview_etag'] || meta['Preview-Etag']
    if (storedSig && String(storedSig) !== expectedSignature) {
      return new Response(JSON.stringify({ error: "Preview out of date — please regenerate" }), { status: 412, headers: { "Content-Type": "application/json" } })
    }
  } catch {
    return new Response(JSON.stringify({ error: "Preview not ready" }), { status: 409, headers: { "Content-Type": "application/json" } })
  }

  // Compute the next version and write a versioned copy quickly server-side
  const latest = await prisma.contractReport.findFirst({ where: { contractId: id }, orderBy: { version: "desc" } })
  const nextVersion = computeVersionIncrement(latest)
  const storageKey = buildVersionedKey(contract, nextVersion)

  // Copy in-space to avoid downloading/uploading
  const copySource = `${BUCKET_NAME}/${previewKey}`
  await s3Client.send(new CopyObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    CopySource: encodeURI(copySource),
    ACL: "public-read",
    ContentType: "application/pdf",
    MetadataDirective: "REPLACE",
  } as any))

  const fileUrl = `${PUBLIC_URL}/${storageKey}`
  // Fetch size for record
  let fileSizeBytes = 0
  try {
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: storageKey } as any))
    const len = (head as any)?.ContentLength
    if (typeof len === 'number' && Number.isFinite(len)) fileSizeBytes = len
  } catch {}
  const generatedOn = new Date()
  const currentUserId = await resolveCurrentUserId()
  const title = titleInput.length ? titleInput : "Inspection Report"

  const report = await prisma.contractReport.create({
    data: {
      contractId: id,
      title,
      version: nextVersion,
      generatedOn,
      generatedById: currentUserId ?? undefined,
      storageKey,
      fileUrl,
      fileSizeBytes,
      // No direct PDF bytes here; we could add HEAD to fetch size if needed
    },
    include: {
      generatedBy: { select: { id: true, username: true, email: true } }
    }
  })

  return new Response(JSON.stringify({ report, version: nextVersion, fileUrl, versionLabel }), { headers: { "Content-Type": "application/json" } })
}
