"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, X, Plus } from "lucide-react"

type ChecklistItem = { item: string; description: string; category: string; isRequired: boolean; order: number }

type Props = {
  showItemForm: boolean
  setShowItemForm: (v: boolean) => void
  selectedTemplate: string
  loadTemplate: (name: string) => void
  templateOptions: string[]
  CATEGORIES: string[]
  editingItems: ChecklistItem[]
  updateEditingItem: (index: number, field: keyof ChecklistItem, value: any) => void
  removeEditingItem: (index: number) => void
  cancelEditing: () => void
  saveItemsToList: () => void
  addSingleItem: () => void
  items: ChecklistItem[]
  rowEditIndex: number | null
  rowEditItem: ChecklistItem | null
  setRowEditItem: (v: ChecklistItem | null) => void
  moveItem: (index: number, dir: 'up' | 'down') => void
  updateItemField: (index: number, field: keyof ChecklistItem, value: any) => void
  removeItem: (index: number) => void
}

export function ChecklistItemsBuilder({
  showItemForm,
  setShowItemForm,
  selectedTemplate,
  loadTemplate,
  templateOptions,
  CATEGORIES,
  editingItems,
  updateEditingItem,
  removeEditingItem,
  cancelEditing,
  saveItemsToList,
  addSingleItem,
  items,
  rowEditIndex,
  rowEditItem,
  setRowEditItem,
  moveItem,
  updateItemField,
  removeItem,
}: Props) {
  return (
    <>
      {showItemForm && (
        <div className="border rounded-lg p-4 mb-4 space-y-4 bg-muted/30">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Adding Items</h4>
            <div className="flex gap-2">
              <Select value={selectedTemplate} onValueChange={(value) => loadTemplate(value)}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Load template..." /></SelectTrigger>
                <SelectContent>
                  {templateOptions.map(area => (
                    <SelectItem key={area} value={area}>{area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={addSingleItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Blank Item
              </Button>
            </div>
          </div>

          {editingItems.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {editingItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-3 bg-background">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Item Name *</Label>
                      <Input value={item.item} onChange={(e) => updateEditingItem(index, 'item', e.target.value)} placeholder="e.g., Ceiling condition" />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={item.category} onValueChange={(value) => updateEditingItem(index, 'category', value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Input value={item.description} onChange={(e) => updateEditingItem(index, 'description', e.target.value)} placeholder="Optional description" />
                    </div>
                    <div className="flex items-center justify-between md:col-span-2">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id={`req-${index}`} checked={item.isRequired} onChange={(e) => updateEditingItem(index, 'isRequired', e.target.checked)} />
                        <Label htmlFor={`req-${index}`}>Required</Label>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeEditingItem(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={cancelEditing}>Cancel</Button>
            <Button type="button" size="sm" onClick={saveItemsToList} disabled={editingItems.filter(i => i.item.trim()).length === 0}>
              <Save className="h-4 w-4 mr-2" />
              Save {editingItems.filter(i => i.item.trim()).length} Items
            </Button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="border rounded-lg p-3 flex items-start gap-2">
              <div className="flex flex-col gap-1 pt-1">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveItem(index, 'up')} disabled={index === 0}>↑</Button>
                <div className="h-4 w-4 text-muted-foreground mx-auto">⋮</div>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveItem(index, 'down')} disabled={index === items.length - 1}>↓</Button>
              </div>
              <div className="flex-1">
                {rowEditIndex === index ? (
                  <div className="space-y-2">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Item Name *</Label>
                        <Input value={rowEditItem?.item || ''} onChange={(e) => setRowEditItem(rowEditItem ? { ...rowEditItem, item: e.target.value } : rowEditItem)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Category</Label>
                        <Select value={rowEditItem?.category || 'GENERAL'} onValueChange={(val) => setRowEditItem(rowEditItem ? { ...rowEditItem, category: val } : rowEditItem)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label>Description</Label>
                        <Input value={rowEditItem?.description || ''} onChange={(e) => setRowEditItem(rowEditItem ? { ...rowEditItem, description: e.target.value } : rowEditItem)} />
                      </div>
                      <div className="flex items-center justify-between md:col-span-2">
                        <div className="flex items-center space-x-2">
                          <input type="checkbox" id={`row-req-${index}`} checked={rowEditItem?.isRequired || false} onChange={(e) => setRowEditItem(rowEditItem ? { ...rowEditItem, isRequired: e.target.checked } : rowEditItem)} />
                          <Label htmlFor={`row-req-${index}`}>Required</Label>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setRowEditItem(null)}>Cancel</Button>
                          <Button type="button" size="sm" onClick={() => { if (rowEditItem) updateItemField(index, 'item', rowEditItem.item); setRowEditItem(null) }}>Save</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{item.item}</p>
                      <p className="text-sm text-muted-foreground">{item.category} • {item.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setRowEditItem(item)}>Edit</Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
