"use client"

import { Plus, GripVertical, Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChecklistTagLibrary } from "@/components/checklists/checklist-tag-library"
import type { ChecklistDraftItem, ChecklistTemplate } from "../types"

interface ChecklistEditorProps {
  templates: ChecklistTemplate[]
  selectedTemplateId: string
  checklistItems: ChecklistDraftItem[]
  rowEditIndex: number | null
  rowEditItem: ChecklistDraftItem | null
  onSelectTemplate: (templateId: string) => void
  onAddBlankItem: () => void
  onMoveItem: (index: number, direction: "up" | "down") => void
  onRemoveItem: (index: number) => void
  onStartEdit: (index: number) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onRowEditChange: (updates: Partial<ChecklistDraftItem>) => void
  onApplyTag: (label: string) => void
}

export function ChecklistEditor({
  templates,
  selectedTemplateId,
  checklistItems,
  rowEditIndex,
  rowEditItem,
  onSelectTemplate,
  onAddBlankItem,
  onMoveItem,
  onRemoveItem,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRowEditChange,
  onApplyTag,
}: ChecklistEditorProps) {
  return (
    <div className="pt-6">
      <h3 className="text-lg font-semibold mb-2">Checklist</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Select a template and optionally edit items before creating the contract
      </p>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={selectedTemplateId} onValueChange={onSelectTemplate}>
              <SelectTrigger>
                <SelectValue placeholder={"Select a template"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="mb-2" onClick={onAddBlankItem}>
              <Plus className="h-4 w-4 mr-2" /> Add Item
            </Button>
          </div>
        </div>

        <ChecklistTagLibrary onApplyTag={onApplyTag} />

        {checklistItems.length > 0 ? (
          <div className="space-y-2">
            {checklistItems.map((item, index) => {
              const isEditing = rowEditIndex === index
              return (
                <div key={index} className="border rounded-lg p-3 flex items-start gap-2">
                  <div className="flex flex-col gap-1 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onMoveItem(index, "up")}
                      disabled={index === 0}
                    >
                      ↑
                    </Button>
                    <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onMoveItem(index, "down")}
                      disabled={index === checklistItems.length - 1}
                    >
                      ↓
                    </Button>
                  </div>
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Item Name *</Label>
                            <Input
                              value={rowEditItem?.item || ""}
                              onChange={(event) =>
                                onRowEditChange({ item: event.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Description</Label>
                            <Input
                              value={rowEditItem?.description || ""}
                              onChange={(event) =>
                                onRowEditChange({ description: event.target.value })
                              }
                            />
                          </div>
                          <div className="flex items-center justify-end md:col-span-2 gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={onSaveEdit}
                              disabled={!rowEditItem?.item?.trim()}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">
                            {item.order}. {item.item}
                          </p>
                          {item.description && (
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onStartEdit(index)}
                            aria-label="Edit item"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemoveItem(index)}
                            aria-label="Remove"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No checklist items selected. Choose a template or add items.
          </p>
        )}
      </div>
    </div>
  )
}
