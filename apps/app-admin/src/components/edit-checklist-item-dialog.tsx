"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextareaHTMLAttributes } from "react"
import { Pencil, Save, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function EditChecklistItemDialog({
  itemId,
  initialName,
  initialRemarks,
  initialStatus = 'PENDING',
  initialCondition,
  triggerVariant = "ghost"
}: {
  itemId: string
  initialName?: string
  initialRemarks?: string
  initialStatus?: 'PENDING' | 'COMPLETED'
  initialCondition?: 'GOOD' | 'FAIR' | 'UNSATISFACTORY' | 'NOT_APPLICABLE' | 'UN_OBSERVABLE' | undefined
  triggerVariant?: "ghost" | "outline" | "default"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName || "")
  const [remarks, setRemarks] = useState(initialRemarks || "")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED'>(initialStatus)
  const [condition, setCondition] = useState<string | undefined>(initialCondition)

  const onSave = async () => {
    setSaving(true)
    try {
      await fetch(`/api/checklist-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, remarks, status, condition })
      })
      setOpen(false)
      router.refresh()
    } catch (e) {
      // noop
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} aria-label="Edit checklist item">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Checklist Item</DialogTitle>
          <DialogDescription>Update the item name, status, condition and remarks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-item-name">Name</Label>
            <Input
              id="edit-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus:border-gray-300"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className="w-full border rounded-md px-3 pr-8 py-2 focus:outline-none focus:ring-0 focus:border-gray-300"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="PENDING">Pending</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <select
                className="w-full border rounded-md px-3 pr-8 py-2 focus:outline-none focus:ring-0 focus:border-gray-300"
                value={condition || ''}
                onChange={(e) => setCondition(e.target.value || undefined)}
              >
                <option value="">Select condition</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair</option>
                <option value="UNSATISFACTORY">Unsatisfactory</option>
                <option value="NOT_APPLICABLE">Not Applicable</option>
                <option value="UN_OBSERVABLE">Un-Observable</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-item-remarks">Remarks</Label>
            <textarea
              id="edit-item-remarks"
              className="w-full min-h-[80px] px-3 py-2 border rounded-md focus:outline-none focus:ring-0 focus:border-gray-300"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional detailed notes"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
