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
  return `${greeting}\n\nWe've prepared your contract report (Version ${versionLabel}). You can download it here: ${fileUrl}\n\nLet us know if you have any questions.\n\n— Property Stewards`
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await context.params

  const report = await fetchReport(id, reportId)
  if (!report) {
    return new Response(JSON.stringify({ error: "Report not found" }), { status: 404 })
  }

  if (!report.fileUrl) {
    return new Response(JSON.stringify({ error: "Report file unavailable" }), { status: 400 })
  }

  const phone = report.contract?.customer?.phone
  if (!phone) {
    return new Response(JSON.stringify({ error: "Customer phone not available" }), { status: 400 })
  }

  const versionLabel = `v${Number(report.version).toFixed(1)}`
  const message = buildWhatsAppMessage(report.contract?.customer?.name, versionLabel, report.fileUrl)

  await sendWhatsAppResponse(phone, message)

  return new Response(JSON.stringify({ success: true }))
}
