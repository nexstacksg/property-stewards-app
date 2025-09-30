"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Plus, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { showToast } from "@/lib/toast"

interface ChecklistTemplate {
  id: string
  name: string
  remarks?: string
  propertyType: string
  items: {
    id: string
    name: string
    action: string
    order: number
  }[]
}

interface AddChecklistButtonProps {
  contractId: string
  propertyType: string
}

export function AddChecklistButton({ contractId, propertyType }: AddChecklistButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) {
      fetchTemplates()
    }
  }, [open])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/checklist-templates?propertyType=${propertyType}&status=ACTIVE`)
      const data = await response.json()
      setTemplates(data.templates || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddChecklist = async () => {
    if (!selectedTemplateId) return

    setCreating(true)
    try {
      const response = await fetch(`/api/contracts/${contractId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId })
      })

      if (response.ok) {
        setOpen(false)
        router.refresh()
        showToast({ title: "Checklist assigned", variant: "success" })
      } else {
        const error = await response.json()
        showToast({ title: "Failed to add checklist", description: error.error, variant: "error" })
      }
    } catch (error) {
      console.error('Error adding checklist:', error)
      showToast({ title: 'Failed to add checklist', variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Checklist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Inspection Checklist</DialogTitle>
          <DialogDescription>
            Select a checklist template for this contract
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Checklist Template</Label>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2">Loading templates...</span>
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No templates available for {propertyType} properties
              </p>
            ) : (
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      <div>
                        <p className="font-medium">{template.name}</p>
                        {template.remarks && (
                          <p className="text-xs text-muted-foreground">{template.remarks}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {template.items.length} items
                        </p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddChecklist} 
              disabled={!selectedTemplateId || creating}
            >
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Checklist
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
