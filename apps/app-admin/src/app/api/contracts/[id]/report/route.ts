import { NextRequest } from "next/server"

import { buildContractReportFilename } from "@/lib/filename"
import { getContractWithWorkOrders } from "./contract-fetcher"
import { createContractReportBuffer } from "./report-builder"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const contract = await getContractWithWorkOrders(id)

  if (!contract) {
    return new Response("Contract not found", { status: 404 })
  }

  const workOrders = contract.workOrders || []
  if (workOrders.length === 0) {
    return new Response("No work orders linked to this contract", { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const customTitle = searchParams.get("title")
  const versionParam = searchParams.get("version")
  const versionLabel = versionParam ? (versionParam.startsWith("v") ? versionParam : `v${versionParam}`) : "v0.0 (Preview)"
  const generatedOn = new Date()

  const buffer = await createContractReportBuffer(contract, {
    titleOverride: customTitle,
    versionLabel,
    generatedOn
  })

  const fileName = buildContractReportFilename(contract.customer?.name, contract.address?.postalCode, contract.id)

  return new Response(buffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`
    }
  })
}
