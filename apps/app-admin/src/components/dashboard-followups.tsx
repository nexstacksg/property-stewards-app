"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type RemarkType = "FOLLOW_UP" | "FYI"
type RemarkStatus = "OPEN" | "COMPLETED"

type DashboardRemark = {
  id: string
  body: string
  createdOn: string
  type: RemarkType
  status: RemarkStatus
  contractId: string
  contract: {
    id: string
    customer: { id: string; name: string } | null
  } | null
}

type ListResponse = {
  remarks: DashboardRemark[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  counts: { open: number; completed: number }
}

export function DashboardFollowUps({ defaultPage = 1, pageSize = 10 }: { defaultPage?: number; pageSize?: number }) {
  const [page, setPage] = useState(defaultPage)
  // Requirement: only display Open status on dashboard.
  // Default the filter to OPEN and remove the ability to change it.
  const [statusFilter] = useState<"ALL" | "OPEN" | "COMPLETED">("OPEN")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ListResponse | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = async (nextPage = page, status = statusFilter) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(pageSize), status })
      const res = await fetch(`/api/remarks?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load remarks")
      const payload = (await res.json()) as ListResponse
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load remarks")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pageSize])

  const toggleStatus = async (remark: DashboardRemark) => {
    const nextStatus: RemarkStatus = remark.status === "OPEN" ? "COMPLETED" : "OPEN"
    setUpdatingId(remark.id)
    try {
      const res = await fetch(`/api/contracts/remarks/${remark.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || "Failed to update status")
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setUpdatingId(null)
    }
  }

  const openCount = data?.counts.open ?? 0
  const completedCount = data?.counts.completed ?? 0
  const totalCount = openCount + completedCount

  const pageInfo = data?.pagination
  const remarks = data?.remarks ?? []

  const headerNote = useMemo(() => {
    // With the dashboard restricted to OPEN only, always show open summary
    return `${openCount} open follow-up${openCount === 1 ? "" : "s"}`
  }, [statusFilter, openCount, completedCount, totalCount])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Showing:</span>
          <span className="px-2 py-1 border rounded bg-background">Open</span>
          <span className="ml-2">{headerNote}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {loading ? "Loading…" : error ? <span className="text-destructive">{error}</span> : null}
        </div>
      </div>

      {remarks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No follow-up remarks found.</p>
      ) : (
        <>
          {/* Cards on small screens */}
          <div className="md:hidden space-y-3">
            {remarks.map((remark) => {
              const logged = new Date(remark.createdOn).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })
              return (
                <div key={remark.id} className="rounded-lg border bg-card text-card-foreground p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {remark.contract?.customer ? (
                          <Link href={`/customers/${remark.contract.customer.id}`} className="font-medium text-primary hover:underline truncate max-w-[160px]" title={remark.contract.customer.name}>
                            {remark.contract.customer.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <Badge variant={remark.status === "OPEN" ? "info" : "success"}>
                          {remark.status === "OPEN" ? "Open" : "Completed"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Link href={`/contracts/${remark.contract?.id ?? remark.contractId}`} className="font-mono text-xs text-primary hover:underline">
                          #{remark.contract?.id ?? remark.contractId}
                        </Link>
                        <span>•</span>
                        <Badge variant={remark.type === "FOLLOW_UP" ? "secondary" : "outline"} className="whitespace-nowrap">{remark.type === "FOLLOW_UP" ? "Follow Up" : "FYI"}</Badge>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleStatus(remark)}
                        disabled={updatingId === remark.id}
                      >
                        {remark.status === "OPEN" ? "Mark" : "Reopen"}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm truncate" title={remark.body}>{remark.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{logged}</p>
                </div>
              )
            })}
          </div>

          {/* Table on md+ screens */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logged</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remarks.map((remark) => (
                  <TableRow key={remark.id}>
                    <TableCell className="text-sm">
                      {remark.contract?.customer ? (
                        <Link href={`/customers/${remark.contract.customer.id}`} className="text-primary hover:underline">
                          {remark.contract.customer.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link href={`/contracts/${remark.contract?.id ?? remark.contractId}`} className="font-mono text-xs text-primary hover:underline">
                        #{remark.contract?.id ?? remark.contractId}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      <span className="block truncate" title={remark.body}>{remark.body}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant={remark.type === "FOLLOW_UP" ? "secondary" : "outline"}>
                        {remark.type === "FOLLOW_UP" ? "Follow Up" : "FYI"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant={remark.status === "OPEN" ? "info" : "success"}>
                        {remark.status === "OPEN" ? "Open" : "Completed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(remark.createdOn).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleStatus(remark)}
                        disabled={updatingId === remark.id}
                      >
                        {remark.status === "OPEN" ? "Mark complete" : "Reopen"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {pageInfo ? (
            <>Showing {(pageInfo.page - 1) * pageInfo.limit + (remarks.length ? 1 : 0)}–{(pageInfo.page - 1) * pageInfo.limit + remarks.length} of {pageInfo.total}</>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = Math.max(1, (pageInfo?.page || 1) - 1)
              setPage(next)
              load(next)
            }}
            disabled={!pageInfo || pageInfo.page <= 1 || loading}
          >
            Previous
          </Button>
          <span>
            Page {pageInfo?.page ?? 1} of {pageInfo?.totalPages ?? 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = Math.min(pageInfo!.totalPages, (pageInfo?.page || 1) + 1)
              setPage(next)
              load(next)
            }}
            disabled={!pageInfo || (pageInfo.page >= pageInfo.totalPages) || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
