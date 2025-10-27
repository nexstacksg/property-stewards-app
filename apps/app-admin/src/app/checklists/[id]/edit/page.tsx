"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import PropertyTypeSelect from "@/components/property-type-select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { ChecklistTemplateLocationsEditor } from "@/components/checklists/edit/checklist-locations-editor"
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  ChecklistLocationDraft,
  ChecklistTaskDraft,
  createEmptyLocation,
  createEmptyTask,
  sanitiseTasks,
} from "@/components/checklists/edit/checklist-utils"

// Types and constants imported from shared utils

interface ChecklistResponseTask {
  id: string
  name: string
  order: number
  actions: string[]
}

interface ChecklistResponseItem {
  id: string
  name: string
  order: number
  status?: string
  isRequired?: boolean
  category?: string
  tasks?: ChecklistResponseTask[]
}

interface ChecklistResponse {
  id: string
  name: string
  remarks?: string
  propertyType: string
  status: string
  items: ChecklistResponseItem[]
}

// creation + sanitize helpers imported

const mapResponseItemToDraft = (
  item: ChecklistResponseItem,
  index: number,
): ChecklistLocationDraft => ({
  id: item.id,
  location: item.name || "",
  category: item.category || DEFAULT_CATEGORY,
  isRequired: item.isRequired ?? true,
  order: item.order ?? index + 1,
  status: item.status,
  tasks: Array.isArray(item.tasks)
    ? item.tasks.map((task) => ({
        id: task.id,
        name: task.name || "",
        details: Array.isArray(task.actions) ? task.actions.join(", ") : "",
      }))
    : [],
})

const toApiPayload = (locations: ChecklistLocationDraft[]) =>
  locations.map((location, index) => ({
    id: location.id,
    name: location.location.trim(),
    category: location.category,
    isRequired: location.isRequired,
    status: location.status,
    order: index + 1,
    tasks: sanitiseTasks(location.tasks)
      .filter((task) => task.name.length > 0)
      .map((task, taskIndex) => ({
        id: task.id,
        name: task.name,
        order: taskIndex + 1,
        actions: task.details
          .split(",")
          .map((detail) => detail.trim())
          .filter((detail) => detail.length > 0),
      })),
  }))

export default function EditChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [checklistId, setChecklistId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [propertyType, setPropertyType] = useState<string>("HDB")
  const [status, setStatus] = useState("ACTIVE")

  const [locations, setLocations] = useState<ChecklistLocationDraft[]>([])
  
  useEffect(() => {
    const loadChecklist = async () => {
      try {
        const resolved = await params
        setChecklistId(resolved.id)
        const response = await fetch(`/api/checklists/${resolved.id}`)
        if (!response.ok) throw new Error("Failed to fetch checklist")
        const checklist: ChecklistResponse = await response.json()
        setName(checklist.name)
        setDescription(checklist.remarks || "")
        setPropertyType(checklist.propertyType)
        setStatus(checklist.status)
        const mapped = (checklist.items || []).map(mapResponseItemToDraft)
        setLocations(mapped)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load checklist")
      } finally {
        setLoading(false)
      }
    }
    loadChecklist()
  }, [params])
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!checklistId) return

    setError("")
    setSaving(true)

    try {
      const response = await fetch(`/api/checklists/${checklistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          remarks: description,
          propertyType,
          status,
          items: toApiPayload(locations),
        }),
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

  const totalCategories = Array.from(
    new Set(locations.map((location) => location.category)),
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={checklistId ? `/checklists/${checklistId}` : "/checklists"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Checklist Template</h1>
          <p className="text-muted-foreground mt-1">
            Update checklist locations and tasks
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
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
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g., Premium Condo Inspection"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propertyType">Property Type *</Label>
                    <PropertyTypeSelect
                      value={propertyType}
                      onChange={setPropertyType}
                    />
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
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Optional description of this checklist template"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            
            <ChecklistTemplateLocationsEditor
              locations={locations}
              onLocationsChange={setLocations}
            />

          </div>

          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Template Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Template ID</p>
                  <p className="font-mono text-sm">
                    #{checklistId?.slice(-8).toUpperCase()}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={status === "ACTIVE" ? "success" : "secondary"}>
                    {status}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <Badge variant="outline">{propertyType}</Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Total Locations</p>
                  <p className="text-2xl font-bold">{locations.length}</p>
                </div>

                {locations.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Categories</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {totalCategories.map((category) => (
                        <Badge key={category} variant="secondary" className="text-xs">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={saving || !name || locations.length === 0}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Link
                    href={checklistId ? `/checklists/${checklistId}` : "/checklists"}
                    className="block"
                  >
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
