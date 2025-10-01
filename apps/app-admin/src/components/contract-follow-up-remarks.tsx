"use client"

import { useState } from "react"

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

export function ContractFollowUpRemarks({ contractId, initialRemarks = [] }: ContractFollowUpRemarksProps) {
  const [remarks, setRemarks] = useState<ContractRemarkEntry[]>(initialRemarks)
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
      setValue("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add remark")
    } finally {
      setSubmitting(false)
    }
  }

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
            {remarks.map((entry) => {
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
