"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, X, Loader2, GripVertical, Save } from "lucide-react"

interface ChecklistItem {
  item: string
  description: string
  category: string
  isRequired: boolean
  order: number
}

const PROPERTY_TYPES = ["HDB", "CONDO", "EC", "APARTMENT", "LANDED"]
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

export default function NewChecklistPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [propertyType, setPropertyType] = useState<string>("HDB")
  
  // Checklist items
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItems, setEditingItems] = useState<ChecklistItem[]>([])
  const [currentArea, setCurrentArea] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("")

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
                    <Select value={propertyType} onValueChange={setPropertyType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                {showItemForm && (
                  <div className="border rounded-lg p-4 mb-4 space-y-4 bg-muted/30">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold">Adding Items</h4>
                      <div className="flex gap-2">
                        <Select value={selectedTemplate} onValueChange={(value) => {
                          loadTemplate(value)
                        }}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Load template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(AREA_TEMPLATES).map(area => (
                              <SelectItem key={area} value={area}>{area}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addSingleItem}
                        >
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
                                <Input
                                  value={item.item}
                                  onChange={(e) => updateEditingItem(index, 'item', e.target.value)}
                                  placeholder="e.g., Ceiling condition"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Category</Label>
                                <Select
                                  value={item.category}
                                  onValueChange={(value) => updateEditingItem(index, 'category', value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CATEGORIES.map(cat => (
                                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <Label>Description</Label>
                                <Input
                                  value={item.description}
                                  onChange={(e) => updateEditingItem(index, 'description', e.target.value)}
                                  placeholder="Optional inspection guidelines"
                                />
                              </div>

                              <div className="flex items-center justify-between md:col-span-2">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id={`required-${index}`}
                                    checked={item.isRequired}
                                    onChange={(e) => updateEditingItem(index, 'isRequired', e.target.checked)}
                                    className="rounded"
                                  />
                                  <Label htmlFor={`required-${index}`}>Required Item</Label>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeEditingItem(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cancelEditing}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveItemsToList}
                        disabled={editingItems.filter(i => i.item.trim()).length === 0}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save {editingItems.filter(i => i.item.trim()).length} Items
                      </Button>
                    </div>
                  </div>
                )}

                {items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={index} className="border rounded-lg p-3 flex items-start gap-2">
                        <div className="flex flex-col gap-1 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveItem(index, 'up')}
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
                            onClick={() => moveItem(index, 'down')}
                            disabled={index === items.length - 1}
                          >
                            ↓
                          </Button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">
                                {item.order}. {item.item}
                              </p>
                              {item.description && (
                                <p className="text-sm text-muted-foreground">{item.description}</p>
                              )}
                              <div className="flex gap-2 mt-1">
                                <Badge variant="outline">{item.category}</Badge>
                                <Badge variant={item.isRequired ? 'default' : 'secondary'}>
                                  {item.isRequired ? 'Required' : 'Optional'}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !showItemForm && (
                    <p className="text-muted-foreground text-center py-4">
                      No items added yet. Click "Add Items" to start building your checklist.
                    </p>
                  )
                )}
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
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-sm">Checklist Preview</CardTitle>
                  <CardDescription className="text-xs">How inspectors will see this checklist</CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const allItems = [
                      ...items,
                      ...editingItems.filter(item => item.item.trim() !== "")
                    ]
                    
                    if (allItems.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Add items to see preview
                        </p>
                      )
                    }
                    
                    const categories = Array.from(new Set(allItems.map(item => item.category)))
                    
                    return (
                      <div className="space-y-3">
                        {categories.map(category => {
                          const categoryItems = allItems.filter(item => item.category === category)
                          return (
                            <div key={category}>
                              <p className="text-xs font-medium text-orange-600 mb-1">{category}</p>
                              <ul className="text-sm space-y-1 text-muted-foreground">
                                {categoryItems.map((item, idx) => (
                                  <li key={`${category}-${idx}`} className="flex items-start">
                                    <span className="text-orange-400 mr-1">•</span>
                                    <span className="text-xs">
                                      {item.item}
                                      {item.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })}
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            Total: {allItems.length} items
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}