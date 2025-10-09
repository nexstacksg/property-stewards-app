"use client"

import { useCallback, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type ContractRemarkType = "FYI" | "FOLLOW_UP"
type ContractRemarkStatus = "OPEN" | "COMPLETED"

const FOLLOW_UP: ContractRemarkType = "FOLLOW_UP"
const FYI: ContractRemarkType = "FYI"
const OPEN: ContractRemarkStatus = "OPEN"
const COMPLETED: ContractRemarkStatus = "COMPLETED"

const TYPE_LABELS: Record<ContractRemarkType, string> = {
  FOLLOW_UP: "Follow Up",
  FYI: "FYI",
}

const STATUS_LABELS: Record<ContractRemarkStatus, string> = {
  OPEN: "Open",
  COMPLETED: "Completed",
}

interface RemarkAuthor {
  id?: string
  username?: string | null
  email?: string | null
}

interface ContractRemarkEntry {
  id: string
  body: string
  createdOn: string
  createdBy?: RemarkAuthor | null
  type: ContractRemarkType
  status: ContractRemarkStatus
}

interface ContractFollowUpRemarksProps {
  contractId: string
  initialRemarks?: ContractRemarkEntry[]
}

const PAGE_SIZE = 5

export function ContractFollowUpRemarks({ contractId, initialRemarks = [] }: ContractFollowUpRemarksProps) {
  const [remarks, setRemarks] = useState<ContractRemarkEntry[]>(initialRemarks)
  const [page, setPage] = useState(1)
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remarkType, setRemarkType] = useState<ContractRemarkType>(FOLLOW_UP)
  const [listError, setListError] = useState<string | null>(null)
  const [updatingRemarkId, setUpdatingRemarkId] = useState<string | null>(null)
  const [addingRemark, setAddingRemark] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError("Enter a remark before saving.")
      return
    }

    setSubmitting(true)
    setError(null)
    setListError(null)
    try {
      const response = await fetch(`/api/contracts/${contractId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, type: remarkType }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || "Failed to add remark")
      }

      const remark = await response.json() as ContractRemarkEntry
      setRemarks((prev) => [remark, ...prev])
      setPage(1)
      setValue("")
      setRemarkType(FOLLOW_UP)
      setAddingRemark(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add remark")
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = useCallback(async (remarkId: string, nextStatus: ContractRemarkStatus) => {
    setUpdatingRemarkId(remarkId)
    setListError(null)
    try {
      const response = await fetch(`/api/contracts/remarks/${remarkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || "Failed to update remark")
      }

      const updated = await response.json() as ContractRemarkEntry
      setRemarks((previous) => previous.map((entry) => (entry.id === remarkId ? updated : entry)))
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Failed to update remark")
    } finally {
      setUpdatingRemarkId(null)
    }
  }, [])

  const {
    totalPages,
    currentPage,
    paginatedRemarks,
    startDisplay,
    endDisplay,
  } = useMemo(() => {
    const total = remarks.length
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const current = Math.min(page, pages)
    const startIndex = (current - 1) * PAGE_SIZE
    const slice = remarks.slice(startIndex, startIndex + PAGE_SIZE)
    return {
      totalPages: pages,
      currentPage: current,
      paginatedRemarks: slice,
      startDisplay: total === 0 ? 0 : startIndex + 1,
      endDisplay: startIndex + slice.length,
    }
  }, [page, remarks])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-up Remarks</CardTitle>
        <CardDescription>Track ongoing notes for this contract</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {addingRemark ? (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-3">
            <div className="space-y-3">
              <Select
                value={remarkType}
                onValueChange={(value) => setRemarkType(value as ContractRemarkType)}
                disabled={submitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Remark type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FOLLOW_UP}>Follow Up</SelectItem>
                  <SelectItem value={FYI}>FYI</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  if (error) setError(null)
                }}
                placeholder="Add a follow-up note"
                disabled={submitting}
                className="w-full h-13"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => {
                  setAddingRemark(false)
                  setValue("")
                  setRemarkType(FOLLOW_UP)
                  setError(null)
                  setListError(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddingRemark(true)
                setValue("")
                setRemarkType(FOLLOW_UP)
                setError(null)
                setListError(null)
              }}
            >
              Add follow-up remark
            </Button>
          </div>
        )}

        {listError && <p className="text-xs text-destructive">{listError}</p>}

        {remarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No remarks yet. Add the first note to start tracking follow-ups.</p>
        ) : (
          <div className="space-y-3">
            {paginatedRemarks.map((entry) => {
              const author = entry.createdBy?.username || entry.createdBy?.email || "—"
              const createdLabel = new Date(entry.createdOn).toLocaleString("en-SG", {
                dateStyle: "medium",
                timeStyle: "short",
              })

              return (
                <div key={entry.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.type === FOLLOW_UP ? "secondary" : "outline"}>
                        {TYPE_LABELS[entry.type]}
                      </Badge>
                      <Badge variant={entry.status === OPEN ? "info" : "success"}>
                        {STATUS_LABELS[entry.status]}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(entry.id, entry.status === OPEN ? COMPLETED : OPEN)}
                      disabled={updatingRemarkId === entry.id}
                    >
                      {entry.status === OPEN ? "Mark complete" : "Reopen"}
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-line">{entry.body}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{createdLabel}</span>
                    <span>{author}</span>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {startDisplay}–{endDisplay} of {remarks.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <span>Page {currentPage} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
