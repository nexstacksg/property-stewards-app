import { NextRequest } from "next/server"

import prisma from "@/lib/prisma"
import { sendWhatsAppResponse } from "@/app/api/whatsapp/webhook/utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function fetchReport(contractId: string, reportId: string) {
  return prisma.contractReport.findFirst({
    where: { id: reportId, contractId },
    include: {
      contract: {
        include: {
          customer: true
        }
      }
    }
  })
}

function buildWhatsAppMessage(customerName: string | null | undefined, versionLabel: string, fileUrl: string) {
  const greeting = customerName ? `Hi ${customerName},` : "Hi there,";
  return [
    `${greeting}`,
    `We've prepared your contract report (Version ${versionLabel}) for your review and records.`,
    `Download: ${fileUrl}`,
    `If you have any questions or would like to discuss any details, please let us know—happy to help.`,
    `\u2014 Property Stewards`
  ].join('\n\n')
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await context.params
  const body = await request.json().catch(() => ({})) as { phone?: string; message?: string }

  const report = await fetchReport(id, reportId)
  if (!report) {
    return new Response(JSON.stringify({ error: "Report not found" }), { status: 404 })
  }

  if (!report.fileUrl) {
    return new Response(JSON.stringify({ error: "Report file unavailable" }), { status: 400 })
  }

  const fallbackPhone = report.contract?.customer?.phone || '+959767210712'
  const phone = body.phone && body.phone.trim().length ? body.phone.trim() : fallbackPhone

  if (!phone) {
    return new Response(JSON.stringify({ error: "Customer phone not available" }), { status: 400 })
  }

  const versionLabel = `v${Number(report.version).toFixed(1)}`
  const message = body.message && body.message.trim().length
    ? body.message
    : buildWhatsAppMessage(report.contract?.customer?.name, versionLabel, report.fileUrl)

  await sendWhatsAppResponse(phone, message)

  return new Response(JSON.stringify({ success: true }))
}
