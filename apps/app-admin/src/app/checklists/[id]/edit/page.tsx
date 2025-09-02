"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, X, Loader2, Save, GripVertical } from "lucide-react"

interface ChecklistItem {
  id?: string
  item: string
  description: string
  category: string
  isRequired: boolean
  order: number
  status?: string
  name?:string
  action?:string
}

interface Checklist {
  id: string
  name: string
  description?: string
  propertyType: string
  status: string
  items: ChecklistItem[]
}

const PROPERTY_TYPES = ["HDB", "CONDO", "EC", "APARTMENT", "LANDED"]
const CATEGORIES = ["GENERAL", "ELECTRICAL", "PLUMBING", "STRUCTURAL", "SAFETY", "EXTERIOR", "INTERIOR", "APPLIANCES"]

export default function EditChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [checklistId, setChecklistId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [propertyType, setPropertyType] = useState<string>("HDB")
  const [status, setStatus] = useState("ACTIVE")
  
  // Checklist items
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([])
  const [showItemForm, setShowItemForm] = useState(false)
  const [newItem, setNewItem] = useState<ChecklistItem>({
    item: "",
    description: "",
    category: "GENERAL",
    isRequired: true,
    order: 1
  })

  useEffect(() => {
    const loadChecklist = async () => {
      const resolvedParams = await params
      setChecklistId(resolvedParams.id)
      await fetchChecklist(resolvedParams.id)
    }
    loadChecklist()
  }, [params])

  const fetchChecklist = async (id: string) => {
    try {
      const response = await fetch(`/api/checklists/${id}`)
      if (!response.ok) throw new Error("Failed to fetch checklist")
      
      const checklist: Checklist = await response.json()
      
      setName(checklist.name)
      setDescription(checklist.description || "")
      setPropertyType(checklist.propertyType)
      setStatus(checklist.status)
      setItems(checklist.items)
      setNewItem({ ...newItem, order: checklist.items.length + 1 })
      
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checklist")
      setLoading(false)
    }
  }

  const addItem = () => {
    if (newItem.item && newItem.category) {
      setItems([...items, { ...newItem, order: items.length + 1, status: 'ACTIVE' }])
      setNewItem({
        item: "",
        description: "",
        category: "GENERAL",
        isRequired: true,
        order: items.length + 2
      })
      setShowItemForm(false)
    }
  }

  const removeItem = (index: number) => {
    const item = items[index]
    if (item.id) {
      setDeletedItemIds([...deletedItemIds, item.id])
    }
    
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
    ;[newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]]
    
    // Update order
    newItems.forEach((item, i) => {
      item.order = i + 1
    })
    
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checklistId) return
    
    setError("")
    setSaving(true)

    try {
      const response = await fetch(`/api/checklists/${checklistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          propertyType,
          status,
          items,
          deletedItemIds
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update checklist")
      }

      router.push(`/checklists/${checklistId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={checklistId ? `/checklists/${checklistId}` : "/checklists"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Checklist Template</h1>
          <p className="text-muted-foreground mt-1">Update checklist template information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Checklist Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Template Information</CardTitle>
                <CardDescription>Update the checklist template details</CardDescription>
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

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
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
                    <CardDescription>Manage inspection items</CardDescription>
                  </div>
                  {!showItemForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowItemForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {showItemForm && (
                  <div className="border rounded-lg p-4 mb-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Item Name *</Label>
                        <Input
                          value={newItem.item}
                          onChange={(e) => setNewItem({ ...newItem, item: e.target.value })}
                          placeholder="e.g., Living Room Ceiling"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Category *</Label>
                        <Select
                          value={newItem.category}
                          onValueChange={(value) => setNewItem({ ...newItem, category: value })}
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
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          placeholder="Optional description or inspection guidelines"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="isRequired"
                          checked={newItem.isRequired}
                          onChange={(e) => setNewItem({ ...newItem, isRequired: e.target.checked })}
                          className="rounded"
                        />
                        <Label htmlFor="isRequired">Required Item</Label>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowItemForm(false)
                          setNewItem({
                            item: "",
                            description: "",
                            category: "GENERAL",
                            isRequired: true,
                            order: items.length + 1
                          })
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addItem}
                        disabled={!newItem.item || !newItem.category}
                      >
                        Add Item
                      </Button>
                    </div>
                  </div>
                )}

                {items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={item.id || index} className="border rounded-lg p-3 flex items-start gap-2">
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
                                {item.order}. {item.name || item.item}
                              </p>
                              {item.action || item.description && (
                                <p className="text-sm text-muted-foreground">{item.action || item.description}</p>
                              )}
                              <div className="flex gap-2 mt-1">
                                {/* <Badge variant="outline">{item.category}</Badge> */}
                                <Badge variant={item.isRequired ? 'default' : 'secondary'}>
                                  {item.isRequired ? 'Required' : 'Optional'}
                                </Badge>
                                {item.status && (
                                  <Badge variant={item.status === 'ACTIVE' ? 'success' : 'secondary'}>
                                    {item.status}
                                  </Badge>
                                )}
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
                      No items in this checklist.
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
                  <p className="text-sm text-muted-foreground">Template ID</p>
                  <p className="font-mono text-sm">#{checklistId?.slice(-8).toUpperCase()}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>
                    {status}
                  </Badge>
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
                    disabled={saving || !name || items.length === 0}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Link href={checklistId ? `/checklists/${checklistId}` : "/checklists"} className="block">
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}