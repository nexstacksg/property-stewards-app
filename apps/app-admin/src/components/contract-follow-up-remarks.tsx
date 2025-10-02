"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError("Enter a remark before saving.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/contracts/${contractId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || "Failed to add remark")
      }

      const remark = await response.json() as ContractRemarkEntry
      setRemarks((prev) => [remark, ...prev])
      setPage(1)
      setValue("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add remark")
    } finally {
      setSubmitting(false)
    }
  }

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
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                if (error) setError(null)
              }}
              placeholder="Add a follow-up note"
              disabled={submitting}
            />
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Add"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

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
                <div key={entry.id} className="rounded-md border p-3">
                  <p className="text-sm">{entry.body}</p>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
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
