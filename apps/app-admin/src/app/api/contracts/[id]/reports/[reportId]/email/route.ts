import { NextRequest } from "next/server"

import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function fetchReport(contractId: string, reportId: string) {
  return prisma.contractReport.findFirst({
    where: { id: reportId, contractId },
    include: {
      contract: {
        include: {
          customer: true,
          address: true
        }
      }
    }
  })
}

function buildEmailBody(customerName: string | null | undefined, versionLabel: string, fileUrl: string) {
  const salutation = customerName ? `Dear ${customerName},` : "Dear Customer,"
  return {
    text: `${salutation}\n\nPlease find attached the contract report (Version ${versionLabel}) for your review and records.\n\nIf you have any questions or would like to discuss any details, please feel free to reach out. We will be glad to provide clarification or further assistance as needed.\n\nThank you for your continued trust and partnership.\n\nBest regards,\nProperty Stewards`,
    html: `
      <p>${salutation}</p>
      <p>Please find attached the contract report (Version ${versionLabel}) for your review and records.</p>
      <p>If you have any questions or would like to discuss any details, please feel free to reach out. We will be glad to provide clarification or further assistance as needed.</p>
      <p>Thank you for your continued trust and partnership.</p>
      <p>Best regards,<br/>Property Stewards</p>
      <p><a href="${fileUrl}">Download the report</a></p>
    `
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await context.params
  const body = await request.json().catch(() => ({})) as { to?: string[]; cc?: string[] }

  const report = await fetchReport(id, reportId)
  if (!report) {
    return new Response(JSON.stringify({ error: "Report not found" }), { status: 404 })
  }

  if (!report.fileUrl) {
    return new Response(JSON.stringify({ error: "Report file unavailable" }), { status: 400 })
  }

  const fallbackEmail = report.contract?.customer?.email || "hein@nexbe.sg"
  const primaryRecipients = Array.isArray(body.to) && body.to.length
    ? body.to
    : fallbackEmail
      ? [fallbackEmail]
      : []

  if (primaryRecipients.length === 0) {
    return new Response(JSON.stringify({ error: "No recipient email provided" }), { status: 400 })
  }

  const ccRecipients = Array.isArray(body.cc) ? body.cc.filter((email) => email && email.trim().length > 0) : []

  const versionLabel = `v${Number(report.version).toFixed(1)}`
  const { text, html } = buildEmailBody(report.contract?.customer?.name, versionLabel, report.fileUrl)

  let attachmentBuffer: Buffer | undefined
  try {
    const fetchResponse = await fetch(report.fileUrl)
    if (fetchResponse.ok) {
      const arrayBuffer = await fetchResponse.arrayBuffer()
      attachmentBuffer = Buffer.from(arrayBuffer)
    }
  } catch (error) {
    console.warn("Unable to download report for email attachment", error)
  }

  await sendEmail({
    to: primaryRecipients.join(","),
    subject: `${report.title} (${versionLabel})`,
    text,
    html,
    attachments: attachmentBuffer
      ? [
          {
            filename: `${report.title.replace(/\s+/g, "-")}-${versionLabel}.pdf`,
            content: attachmentBuffer,
            contentType: "application/pdf"
          }
        ]
      : undefined,
    cc: ccRecipients.length ? ccRecipients.join(",") : undefined
  })

  return new Response(JSON.stringify({ success: true }))
}
