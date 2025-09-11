"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import WorkOrderItemMedia from "@/components/work-order-item-media"

type Entry = {
  id: string
  remarks?: string | null
  photos?: string[] | null
  videos?: string[] | null
  includeInReport?: boolean | null
  inspector?: { id: string; name: string } | null
}

export default function ItemEntriesDialog({
  itemId,
  workOrderId,
  entries = [],
  itemName,
}: {
  itemId: string
  workOrderId: string
  entries?: Entry[]
  itemName?: string
}) {
  const [open, setOpen] = useState(false)
  const [localEntries, setLocalEntries] = useState<Entry[]>(entries)

  const toggleInclude = async (entryId: string, value: boolean) => {
    setLocalEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, includeInReport: value } : e)))
    try {
      await fetch(`/api/checklist-items/contributions/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeInReport: value }),
      })
    } catch {}
  }

  const count = entries?.length || 0
  const disabled = count === 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative z-10" disabled={disabled}>
          Remarks ({count})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{itemName ? `${itemName} — ` : ''}Inspector Remarks</DialogTitle>
        </DialogHeader>
        {(!localEntries || localEntries.length === 0) ? (
          <p className="text-sm text-muted-foreground">No remarks available.</p>
        ) : (
          <div className="space-y-3">
            {localEntries.map((c) => (
              <div key={c.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">By {c.inspector?.name || 'Inspector'}</p>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(c.includeInReport)}
                      onChange={(e) => toggleInclude(c.id, e.target.checked)}
                    />
                    Use in final report
                  </label>
                </div>
                {c.remarks && (
                  <p className="text-sm text-muted-foreground mt-1">{c.remarks}</p>
                )}
                <div className="mt-2">
                  <WorkOrderItemMedia
                    itemId={itemId}
                    workOrderId={workOrderId}
                    photos={c.photos || []}
                    videos={c.videos || []}
                    itemName={itemName ? `${itemName} — ${c.inspector?.name || ''}` : c.inspector?.name || ''}
                    contributionId={c.id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
