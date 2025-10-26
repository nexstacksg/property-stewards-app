import { NextRequest } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"

import { getContractWithWorkOrders } from "@/app/api/contracts/[id]/report/contract-fetcher"
import { createContractReportBuffer } from "@/app/api/contracts/[id]/report/report-builder"
import { buildContractReportFilename, sanitizeSegment } from "@/lib/filename"
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from "@/lib/s3-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function buildPreviewFile(id: string, requestUrl: string) {
  const contract = await getContractWithWorkOrders(id)
  if (!contract) {
    return { error: new Response(JSON.stringify({ error: "Contract not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) }
  }

  const { searchParams } = new URL(requestUrl)
  const customTitle = searchParams.get("title")
  const versionParam = searchParams.get("version")
  const versionLabel = versionParam ? (versionParam.startsWith("v") ? versionParam : `v${versionParam}`) : "v0.0 (Preview)"

  const generatedOn = new Date()
  const buffer = await createContractReportBuffer(contract, {
    titleOverride: customTitle,
    versionLabel,
    generatedOn,
    entryOnly: true,
  })

  // Upload to Spaces without creating a DB record (ephemeral preview)
  const nameSeg = sanitizeSegment(contract.customer?.name) || "contract"
  const postalSeg = sanitizeSegment(contract.address?.postalCode) || contract.id.slice(-8)
  // Same folder as versioned files; fixed preview name
  const folder = `${SPACE_DIRECTORY}/pdf/${nameSeg}-${postalSeg}`
  const storageKey = `${folder}/contract-${nameSeg}-preview.pdf`

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    Body: buffer,
    ContentType: "application/pdf",
    ACL: "public-read",
  } as any))

  const fileUrl = `${PUBLIC_URL}/${storageKey}`
  return { fileUrl }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const result = await buildPreviewFile(id, request.url)
    if ('error' in result) return result.error
    return new Response(JSON.stringify({ fileUrl: result.fileUrl }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    })
  } catch (error) {
    console.error("Preview generation failed:", error)
    return new Response(JSON.stringify({ error: "Failed to generate preview" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const url = new URL(request.url)
    const wantsJson = url.searchParams.get('format') === 'json'
    const result = await buildPreviewFile(id, request.url)
    if ('error' in result) return result.error
    if (wantsJson) {
      return new Response(JSON.stringify({ fileUrl: result.fileUrl }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      })
    }
    return new Response(null, { status: 302, headers: { Location: result.fileUrl, 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error("Preview generation failed (GET):", error)
    return new Response("Failed to generate preview", { status: 500 })
  }
}
