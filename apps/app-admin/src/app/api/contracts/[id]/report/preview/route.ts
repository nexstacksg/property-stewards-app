import { NextRequest } from "next/server"
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import prisma from "@/lib/prisma"

import { getContractWithWorkOrders } from "@/app/api/contracts/[id]/report/contract-fetcher"
import { createContractReportBuffer } from "@/app/api/contracts/[id]/report/report-builder"
import { buildContractReportFilename, sanitizeSegment } from "@/lib/filename"
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from "@/lib/s3-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Allow longer processing on self-hosted; upstream proxies may still enforce limits
export const maxDuration = 300

async function buildPreviewFile(id: string, requestUrl: string) {
  const url = new URL(requestUrl)
  const checkOnly = url.searchParams.get('check') === '1'
  const versionParam = url.searchParams.get("version")
  const versionLabel = versionParam ? (versionParam.startsWith("v") ? versionParam : `v${versionParam}`) : "v0.0 (Preview)"
  const workOrderId = url.searchParams.get('wo')
  const customTitle = url.searchParams.get("title")

  // For lightweight checks, avoid fetching the full contract tree; we only need the storage key.
  // Prefer client-provided segments to skip DB entirely.
  if (checkOnly) {
    let nameSeg = sanitizeSegment(url.searchParams.get('nameSeg') || url.searchParams.get('name') || '')
    let postalSeg = sanitizeSegment(url.searchParams.get('postalSeg') || url.searchParams.get('postal') || '')

    if (!nameSeg || !postalSeg) {
      const noDb = (process.env.PREVIEW_CHECK_NO_DB || '').toLowerCase() === 'true'
      if (noDb) {
        // Cannot compute a key without DB and no hints — report pending quickly
        return { fileUrl: undefined as any, reused: false as const }
      }
      const baseOnly = await prisma.contract.findUnique({
        where: { id },
        select: { id: true, customer: { select: { name: true } }, address: { select: { postalCode: true } } }
      }) as any
      if (!baseOnly) {
        return { error: new Response(JSON.stringify({ error: 'Contract not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }) }
      }
      nameSeg = sanitizeSegment(baseOnly.customer?.name) || 'contract'
      postalSeg = sanitizeSegment(baseOnly.address?.postalCode) || baseOnly.id.slice(-8)
    }
    const folder = `${SPACE_DIRECTORY}/pdf/${nameSeg}-${postalSeg}`
    const storageKey = `${folder}/contract-${nameSeg}-preview.pdf`
    try {
      const head = await fetch(`${PUBLIC_URL}/${storageKey}`, { method: 'HEAD', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(5000) }).catch(() => null as any)
      if (head && head.ok) {
        return { fileUrl: `${PUBLIC_URL}/${storageKey}?v=${Date.now()}`, reused: true as const }
      }
    } catch {}
    return { fileUrl: undefined as any, reused: false as const }
  }

  // Heavy path: load full tree and compute signature to decide reuse
  const contract = await getContractWithWorkOrders(id)
  if (!contract) {
    return { error: new Response(JSON.stringify({ error: "Contract not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) }
  }

  // Compute a lightweight data signature so we can reuse the preview unless data changed
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
  const normalizedTitle = (customTitle || '').trim()
  const previewSignature = `${contract.id}:${dataEpoch}:${versionLabel}:${normalizedTitle}:${workOrderId || 'all'}`

  const nameSeg = sanitizeSegment(contract.customer?.name) || "contract"
  const postalSeg = sanitizeSegment(contract.address?.postalCode) || contract.id.slice(-8)
  const folder = `${SPACE_DIRECTORY}/pdf/${nameSeg}-${postalSeg}`
  const storageKey = `${folder}/contract-${nameSeg}-preview.pdf`

  // Reuse existing preview unless explicitly bypassed with nocache=1
  const noCache = url.searchParams.get('nocache') === '1'
  if (!noCache) {
    try {
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: storageKey } as any))
      const meta = (head as any)?.Metadata || {}
      const storedSig = meta['preview-etag'] || meta['preview_etag'] || meta['Preview-Etag']
      const valid = storedSig && String(storedSig) === previewSignature
      if (valid) {
        return { fileUrl: `${PUBLIC_URL}/${storageKey}?v=${Date.now()}`, reused: true as const }
      }
    } catch {}
  }

  const generatedOn = new Date()
  let buffer: Buffer
  try {
    buffer = await createContractReportBuffer(contract, {
      titleOverride: customTitle,
      versionLabel,
      generatedOn,
      entryOnly: true,
      filterByWorkOrderId: workOrderId,
    }) as Buffer
  } catch (err) {
    console.error('Preview generation error (builder):', err)
    return { error: new Response(JSON.stringify({ error: 'Failed during PDF build' }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: "application/pdf",
      CacheControl: "no-store, no-cache, must-revalidate, max-age=0",
      Expires: new Date(0) as any,
      Metadata: { 'preview-etag': previewSignature } as any,
      ACL: "public-read",
    } as any))
  } catch (err) {
    console.error('Preview generation error (upload):', err)
    return { error: new Response(JSON.stringify({ error: 'Failed to upload preview file' }), { status: 500, headers: { 'Content-Type': 'application/json' } }) }
  }

  const fileUrl = `${PUBLIC_URL}/${storageKey}?v=${Date.now()}`
  return { fileUrl, reused: false as const }
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
    const isCheck = url.searchParams.get('check') === '1'

    if (wantsJson && !isCheck) {
      // Kick off generation in the background and respond quickly to avoid proxy timeouts
      const key = `${id}|wo=${url.searchParams.get('wo') || ''}|title=${url.searchParams.get('title') || ''}|version=${url.searchParams.get('version') || ''}`
      const globalAny = globalThis as unknown as { __ps_preview_jobs__?: Map<string, number> }
      if (!globalAny.__ps_preview_jobs__) globalAny.__ps_preview_jobs__ = new Map<string, number>()
      const jobs = globalAny.__ps_preview_jobs__!
      const last = jobs.get(key) || 0
      const staleMs = 5 * 60 * 1000
      if (Date.now() - last > staleMs) {
        jobs.set(key, Date.now())
        // Fire-and-forget build; errors are logged server-side
        setImmediate(() => { buildPreviewFile(id, request.url).catch((e) => console.error('Preview build (bg) error:', e)) })
      }
      return new Response(JSON.stringify({ pending: true }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      })
    }

    const result = await buildPreviewFile(id, request.url)
    if ('error' in result) return result.error
    if (wantsJson) {
      const payload = result.fileUrl ? { fileUrl: result.fileUrl } : { pending: true }
      return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      })
    }
    if (result.fileUrl) {
      return new Response(null, { status: 302, headers: { Location: result.fileUrl, 'Cache-Control': 'no-store' } })
    }
    return new Response('Pending', { status: 202, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error("Preview generation failed (GET):", error)
    return new Response("Failed to generate preview", { status: 500 })
  }
}
