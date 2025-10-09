"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ReportActions } from "@/components/report-actions"

interface GeneratedBy {
  username?: string | null
  email?: string | null
}

interface ContractReportEntry {
  id: string
  title: string
  generatedOn: string
  version?: number | string | null
  fileUrl?: string | null
  generatedBy?: GeneratedBy | null
}

interface ContractGeneratedReportsProps {
  contractId: string
  reports: ContractReportEntry[]
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  contactPersons?: Array<{
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
  }>
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 5

export function ContractGeneratedReports({
  contractId,
  reports,
  customerName,
  customerEmail,
  customerPhone,
  contactPersons = [],
  pageSize = DEFAULT_PAGE_SIZE,
}: ContractGeneratedReportsProps) {
  const [page, setPage] = useState(1)

  const { totalPages, paginatedReports, start, end } = useMemo(() => {
    const size = Math.max(1, pageSize)
    const total = reports.length
    const pages = Math.max(1, Math.ceil(total / size))
    const current = Math.min(page, pages)
    const offset = (current - 1) * size
    const slice = reports.slice(offset, offset + size)
    return {
      totalPages: pages,
      paginatedReports: slice,
      start: total === 0 ? 0 : offset + 1,
      end: offset + slice.length,
    }
  }, [page, pageSize, reports])

  const handlePrevious = () => setPage((prev) => Math.max(1, prev - 1))
  const handleNext = () => setPage((prev) => Math.min(totalPages, prev + 1))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated Reports</CardTitle>
        <CardDescription>Versioned PDF history for this contract</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No reports generated yet</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Prepared By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReports.map((report) => {
                  const versionValue = typeof report.version === "number"
                    ? report.version
                    : Number(report.version)
                  const versionLabel = Number.isNaN(versionValue) ? "—" : versionValue.toFixed(1)
                  const generatedLabel = new Date(report.generatedOn).toLocaleString("en-SG", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                  const preparedBy = report.generatedBy?.username || report.generatedBy?.email || "—"

                  return (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">v{versionLabel}</TableCell>
                      <TableCell>{report.title}</TableCell>
                      <TableCell>{generatedLabel}</TableCell>
                      <TableCell>{preparedBy}</TableCell>
                      <TableCell>
                        <ReportActions
                          contractId={contractId}
                          report={{
                            id: report.id,
                            fileUrl: report.fileUrl,
                            version: versionValue,
                          }}
                          customerEmail={customerEmail}
                          customerPhone={customerPhone}
                          customerName={customerName}
                          contactPersons={contactPersons}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {start}–{end} of {reports.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
