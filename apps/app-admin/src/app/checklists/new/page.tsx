"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import PropertyTypeSelect from '@/components/property-type-select'
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, X, Loader2, GripVertical, Save, Pencil } from "lucide-react"
import { ChecklistItemsBuilder } from '@/components/checklists/checklist-items-builder'
import { ChecklistPreview } from '@/components/checklists/checklist-preview'

interface ChecklistItem {
  item: string
  description: string
  category: string
  isRequired: boolean
  order: number
}

type PropertyTypeOption = { id: string; code: string; name: string }
const CATEGORIES = ["GENERAL", "ELECTRICAL", "PLUMBING", "STRUCTURAL", "SAFETY", "EXTERIOR", "INTERIOR", "APPLIANCES"]

// Common room/area templates
const AREA_TEMPLATES = {
  "Living Room": [
    { item: "Ceiling condition", category: "STRUCTURAL", description: "Check for cracks, stains, or damage" },
    { item: "Wall condition", category: "STRUCTURAL", description: "Check for cracks, holes, or water damage" },
    { item: "Floor condition", category: "STRUCTURAL", description: "Check flooring integrity and level" },
    { item: "Power outlets", category: "ELECTRICAL", description: "Test all outlets for functionality" },
    { item: "Light switches", category: "ELECTRICAL", description: "Test all switches and dimmers" },
    { item: "Light fixtures", category: "ELECTRICAL", description: "Check all fixtures are working" },
    { item: "Windows", category: "EXTERIOR", description: "Check operation, locks, and seals" },
    { item: "Doors", category: "INTERIOR", description: "Check alignment, locks, and handles" },
    { item: "Air conditioning", category: "APPLIANCES", description: "Test cooling and check filters" }
  ],
  "Kitchen": [
    { item: "Sink and taps", category: "PLUMBING", description: "Check for leaks and water pressure" },
    { item: "Kitchen cabinets", category: "INTERIOR", description: "Check doors, drawers, and hinges" },
    { item: "Countertops", category: "INTERIOR", description: "Check for damage or stains" },
    { item: "Stove/Cooktop", category: "APPLIANCES", description: "Test all burners and controls" },
    { item: "Hood/Exhaust", category: "APPLIANCES", description: "Test ventilation and filters" },
    { item: "Power outlets", category: "ELECTRICAL", description: "Test all outlets, especially near water" },
    { item: "Dishwasher", category: "APPLIANCES", description: "Test wash cycle if present" },
    { item: "Garbage disposal", category: "PLUMBING", description: "Test operation if present" }
  ],
  "Bathroom": [
    { item: "Toilet", category: "PLUMBING", description: "Check flush, seal, and stability" },
    { item: "Sink and taps", category: "PLUMBING", description: "Check for leaks and drainage" },
    { item: "Shower/Bath", category: "PLUMBING", description: "Test water pressure and drainage" },
    { item: "Tiles and grout", category: "INTERIOR", description: "Check for cracks or missing grout" },
    { item: "Ventilation fan", category: "ELECTRICAL", description: "Test exhaust fan operation" },
    { item: "Water heater", category: "PLUMBING", description: "Test hot water supply" },
    { item: "Mirror and fixtures", category: "INTERIOR", description: "Check mounting and condition" },
    { item: "Towel racks", category: "INTERIOR", description: "Check stability and mounting" }
  ],
  "Bedroom": [
    { item: "Ceiling condition", category: "STRUCTURAL", description: "Check for cracks or stains" },
    { item: "Wall condition", category: "STRUCTURAL", description: "Check for damage or moisture" },
    { item: "Floor condition", category: "STRUCTURAL", description: "Check flooring condition" },
    { item: "Windows", category: "EXTERIOR", description: "Check operation and locks" },
    { item: "Closet doors", category: "INTERIOR", description: "Check sliding or hinged doors" },
    { item: "Power outlets", category: "ELECTRICAL", description: "Test all outlets" },
    { item: "Light fixtures", category: "ELECTRICAL", description: "Test ceiling and wall lights" },
    { item: "Air conditioning", category: "APPLIANCES", description: "Test if present" }
  ]
}



 function NewChecklistContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [propertyType, setPropertyType] = useState<string>("HDB")
  
  // Checklist items
  const [items, setItems] = useState<ChecklistItem[]>([])
  // Inline row edit state
  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditItem, setRowEditItem] = useState<ChecklistItem | null>(null)
  // Helper used by builder to update a single field on an item
  const updateItemField = (index: number, field: keyof ChecklistItem, value: any) => {
    setItems(prev => {
      const next = [...prev]
      const target = next[index]
      if (!target) return prev
      next[index] = { ...target, [field]: value }
      return next
    })
  }
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItems, setEditingItems] = useState<ChecklistItem[]>([])
  const [currentArea, setCurrentArea] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [propertyOptions, setPropertyOptions] = useState<PropertyTypeOption[]>([])

  useEffect(() => {
    // Load property types from API
    const loadProps = async () => {
      try {
        const res = await fetch('/api/properties')
        if (!res.ok) return
        const data = await res.json()
        setPropertyOptions(data)
        if (!propertyType && data.length > 0) setPropertyType(data[0].code)
      } catch (e) {
        console.error('Failed to load property types', e)
      }
    }
    loadProps()
  }, [])

  // If duplicating from an existing checklist
  useEffect(() => {
    const fromId = searchParams?.get('from')
    if (!fromId) return

    const loadFromChecklist = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/checklists/${fromId}`)
        if (!res.ok) return
        const data = await res.json()
        setName(`${data.name} (Copy)`)
        setDescription(data.description || data.remarks || "")
        setPropertyType(data.propertyType || "HDB")
        // Map existing items to editable items structure
        const mapped: ChecklistItem[] = (data.items || []).map((it: any, idx: number) => ({
          item: it.name || it.item || '',
          description: it.action || it.description || '',
          category: 'GENERAL',
          isRequired: false,
          order: it.order || idx + 1
        }))
        setItems(mapped)
      } catch (e) {
        console.error('Failed to load source checklist', e)
      } finally {
        setLoading(false)
      }
    }

    loadFromChecklist()
  }, [searchParams])

  const loadTemplate = (templateName: string) => {
    const template = AREA_TEMPLATES[templateName as keyof typeof AREA_TEMPLATES]
    if (template) {
      const newItems = template.map((item, index) => ({
        ...item,
        isRequired: true,
        order: editingItems.length + index + 1,
        item: `${templateName} - ${item.item}`
      }))
      setEditingItems([...editingItems, ...newItems])
      setSelectedTemplate("")
    }
  }

  const addSingleItem = () => {
    const newItem: ChecklistItem = {
      item: "",
      description: "",
      category: "GENERAL",
      isRequired: true,
      order: editingItems.length + 1
    }
    setEditingItems([...editingItems, newItem])
  }

  const updateEditingItem = (index: number, field: keyof ChecklistItem, value: any) => {
    const updated = [...editingItems]
    updated[index] = { ...updated[index], [field]: value }
    setEditingItems(updated)
  }

  const removeEditingItem = (index: number) => {
    const updated = editingItems.filter((_, i) => i !== index)
    // Reorder
    updated.forEach((item, i) => {
      item.order = i + 1
    })
    setEditingItems(updated)
  }

  const saveItemsToList = () => {
    const validItems = editingItems.filter(item => item.item.trim() !== "")
    if (validItems.length > 0) {
      const reorderedItems = [...items, ...validItems].map((item, index) => ({
        ...item,
        order: index + 1
      }))
      setItems(reorderedItems)
      setEditingItems([])
      setShowItemForm(false)
      setCurrentArea("")
    }
  }

  const cancelEditing = () => {
    setEditingItems([])
    setShowItemForm(false)
    setCurrentArea("")
    setSelectedTemplate("")
  }

  const removeItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index)
    // Reorder items
    updatedItems.forEach((item, i) => {
      item.order = i + 1
    })
    setItems(updatedItems)
    // Reset row edit if needed
    if (rowEditIndex === index) {
      setRowEditIndex(null)
      setRowEditItem(null)
    }
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === items.length - 1)
    ) {
      return
    }

    const newItems = [...items]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    // Swap items
    const temp = newItems[index]
    newItems[index] = newItems[targetIndex]
    newItems[targetIndex] = temp
    
    // Update order
    newItems.forEach((item, i) => {
      item.order = i + 1
    })
    
    setItems(newItems)
  }

  const startRowEdit = (index: number) => {
    setRowEditIndex(index)
    setRowEditItem({ ...items[index] })
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null)
    setRowEditItem(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditItem) return
    const updated = [...items]
    updated[rowEditIndex] = {
      ...rowEditItem,
      order: rowEditIndex + 1,
    }
    setItems(updated)
    setRowEditIndex(null)
    setRowEditItem(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          propertyType,
          items
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create checklist")
      }

      const checklist = await response.json()
      router.push(`/checklists/${checklist.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/checklists">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Checklist Template</h1>
          <p className="text-muted-foreground mt-1">Create a new inspection checklist template</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Checklist Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Template Information</CardTitle>
                <CardDescription>Enter the checklist template details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name *</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Standard HDB Inspection"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propertyType">Property Type *</Label>
                    <PropertyTypeSelect value={propertyType} onChange={setPropertyType} />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <textarea
                      id="description"
                      className="w-full min-h-[80px] px-3 py-2 border rounded-md"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description of this checklist template"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Checklist Items */}
            <Card className="mt-6">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Checklist Items</CardTitle>
                    <CardDescription>Add items to inspect</CardDescription>
                  </div>
                  {!showItemForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowItemForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Items
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ChecklistItemsBuilder
                  showItemForm={showItemForm}
                  setShowItemForm={setShowItemForm}
                  selectedTemplate={selectedTemplate}
                  loadTemplate={loadTemplate}
                  templateOptions={Object.keys(AREA_TEMPLATES)}
                  CATEGORIES={CATEGORIES}
                  editingItems={editingItems}
                  updateEditingItem={updateEditingItem}
                  removeEditingItem={removeEditingItem}
                  cancelEditing={cancelEditing}
                  saveItemsToList={saveItemsToList}
                  addSingleItem={addSingleItem}
                  items={items}
                  rowEditIndex={rowEditIndex}
                  rowEditItem={rowEditItem}
                  setRowEditItem={setRowEditItem as any}
                  moveItem={moveItem}
                  updateItemField={updateItemField}
                  removeItem={removeItem}
                />
              </CardContent>
            </Card>
          </div>

          {/* Template Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Template Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="success">ACTIVE</Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Template will be active immediately
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <Badge variant="outline">{propertyType}</Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl font-bold">{items.length}</p>
                </div>

                {items.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Categories</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from(new Set(items.map(item => item.category))).map(cat => (
                        <Badge key={cat} variant="secondary" className="text-xs">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || !name || items.length === 0}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Template
                  </Button>
                  <Link href="/checklists" className="block">
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Quick Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Use templates for common areas</li>
                  <li>• Add multiple items before saving</li>
                  <li>• Group items by room/area</li>
                  <li>• Mark critical items as required</li>
                  <li>• Be specific in descriptions</li>
                </ul>
              </CardContent>
            </Card>

            {/* Checklist Preview */}
            {(items.length > 0 || editingItems.length > 0) && (
              <ChecklistPreview items={items} editingItems={editingItems} />
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

export default function NewCheckListPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewChecklistContent />
    </Suspense>
  )
}
