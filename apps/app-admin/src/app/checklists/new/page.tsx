"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import {
  ArrowLeft,
  Plus,
  X,
  Loader2,
  GripVertical,
  Save,
  Pencil,
  Trash2,
} from "lucide-react"

const CATEGORIES = [
  "GENERAL",
  "ELECTRICAL",
  "PLUMBING",
  "STRUCTURAL",
  "SAFETY",
  "EXTERIOR",
  "INTERIOR",
  "APPLIANCES",
] as const

const DEFAULT_CATEGORY = "GENERAL"

interface ChecklistTaskDraft {
  id?: string
  name: string
  details: string
}

interface ChecklistLocationDraft {
  id?: string
  location: string
  category: string
  isRequired: boolean
  order: number
  status?: string
  tasks: ChecklistTaskDraft[]
}

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

const AREA_TEMPLATES: Record<string, { name: string; details: string }[]> = {
  "Living & Dining": [
    {
      name: "Inspect walls and ceiling",
      details: "Look for cracks, stains, uneven paint",
    },
    {
      name: "Check flooring",
      details: "Check for hollow tiles, scratches, water damage",
    },
    {
      name: "Test lighting",
      details: "Test switches, dimmers, built-in fixtures",
    },
    {
      name: "Inspect windows and balcony doors",
      details: "Test locks, seals, alignment",
    },
  ],
  "Kitchen": [
    {
      name: "Inspect cabinetry",
      details: "Check hinges, drawer runners, laminate edges",
    },
    {
      name: "Check countertop and backsplash",
      details: "Check for chips, grout gaps, water damage",
    },
    {
      name: "Test plumbing",
      details: "Run taps, check drainage, inspect pipes",
    },
    {
      name: "Test appliances",
      details: "Hob, hood, oven, dishwasher",
    },
  ],
  "Bedrooms": [
    {
      name: "Inspect walls and ceiling",
      details: "Look for stains, water intrusion, flaking paint",
    },
    {
      name: "Test electrical points",
      details: "Check outlets, data points, light controls",
    },
    {
      name: "Check windows",
      details: "Inspect handles, locks, seals",
    },
    {
      name: "Inspect built-ins",
      details: "Wardrobes, shelving, study tables",
    },
  ],
  "Bathrooms": [
    {
      name: "Test plumbing fixtures",
      details: "Flush toilet, run taps, check drainage",
    },
    {
      name: "Inspect waterproofing",
      details: "Look for hollow tiles, regrout needs",
    },
    {
      name: "Inspect ventilation",
      details: "Test exhaust fans, natural ventilation",
    },
    {
      name: "Check glass enclosures",
      details: "Inspect seals, alignment, door swing",
    },
  ],
}

const createEmptyTask = (): ChecklistTaskDraft => ({ name: "", details: "" })

const createEmptyLocation = (order: number): ChecklistLocationDraft => ({
  location: "",
  category: DEFAULT_CATEGORY,
  isRequired: true,
  order,
  tasks: [],
})

const sanitiseTasks = (tasks: ChecklistTaskDraft[]) =>
  tasks
    .map((task) => ({
      ...task,
      name: task.name.trim(),
      details: task.details.trim(),
    }))
    .filter((task) => task.name.length > 0 || task.details.length > 0)

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

function NewChecklistContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [propertyType, setPropertyType] = useState<string>("HDB")

  const [locations, setLocations] = useState<ChecklistLocationDraft[]>([])
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [newLocation, setNewLocation] = useState<ChecklistLocationDraft>(
    createEmptyLocation(1),
  )
  const [selectedTemplate, setSelectedTemplate] = useState("")

  const [newTaskEditIndex, setNewTaskEditIndex] = useState<number | null>(null)
  const [newTaskDraft, setNewTaskDraft] =
    useState<ChecklistTaskDraft | null>(null)

  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditLocation, setRowEditLocation] =
    useState<ChecklistLocationDraft | null>(null)

  useEffect(() => {
    const fromId = searchParams?.get("from")
    if (!fromId) return

    const loadFromChecklist = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/checklists/${fromId}`)
        if (!response.ok) return
        const data: ChecklistResponse = await response.json()

        setName(`${data.name} (Copy)`)
        setDescription(data.remarks || "")
        setPropertyType(data.propertyType || "HDB")
        const mappedLocations = (data.items || []).map(mapResponseItemToDraft)
        setLocations(mappedLocations)
        setNewLocation(createEmptyLocation(mappedLocations.length + 1))
      } catch (err) {
        console.error("Failed to duplicate checklist", err)
      } finally {
        setLoading(false)
      }
    }

    loadFromChecklist()
  }, [searchParams])

  const resetNewLocationForm = () => {
    setSelectedTemplate("")
    setShowLocationForm(false)
    setNewLocation(createEmptyLocation(locations.length + 1))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const addTaskToNewLocation = () => {
    const nextIndex = newLocation.tasks.length
    setNewLocation((prev) => ({
      ...prev,
      tasks: [...prev.tasks, createEmptyTask()],
    }))
    setNewTaskEditIndex(nextIndex)
    setNewTaskDraft(createEmptyTask())
  }
  
  const removeNewLocationTask = (index: number) => {
    setNewLocation((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((_, taskIndex) => taskIndex !== index),
    }))
    if (newTaskEditIndex === index) {
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
    } else if (newTaskEditIndex !== null && newTaskEditIndex > index) {
      setNewTaskEditIndex(newTaskEditIndex - 1)
    }
  }

  const applyTemplateToNewLocation = (templateName: string) => {
    const template = AREA_TEMPLATES[templateName]
    if (!template) return

    setSelectedTemplate(templateName)
    setShowLocationForm(true)
    setNewLocation((prev) => ({
      ...createEmptyLocation(locations.length + 1),
      location: templateName,
      category: prev.category,
      tasks: template.map((task) => ({
        name: task.name,
        details: task.details,
      })),
    }))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const startEditNewTask = (index: number) => {
    const task = newLocation.tasks[index]
    setNewTaskEditIndex(index)
    setNewTaskDraft({ ...task })
  }

  const updateNewTaskDraft = (
    field: keyof ChecklistTaskDraft,
    value: string,
  ) => {
    setNewTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveNewTaskEdit = (index: number) => {
    if (newTaskDraft === null) return
    const trimmedTask: ChecklistTaskDraft = {
      ...newTaskDraft,
      name: newTaskDraft.name.trim(),
      details: newTaskDraft.details.trim(),
    }
    setNewLocation((prev) => {
      const nextTasks = [...prev.tasks]
      nextTasks[index] = trimmedTask
      return { ...prev, tasks: nextTasks }
    })
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const cancelNewTaskEdit = (index: number) => {
    const task = newLocation.tasks[index]
    const isNewTask = !task?.id && !task?.name && !task?.details
    if (isNewTask) {
      setNewLocation((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((_, taskIndex) => taskIndex !== index),
      }))
    }
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const addLocation = () => {
    if (!newLocation.location.trim()) return

    const sanitizedTasks = sanitiseTasks(newLocation.tasks)
    const nextLocations = [
      ...locations,
      {
        ...newLocation,
        location: newLocation.location.trim(),
        tasks: sanitizedTasks,
        order: locations.length + 1,
        status: "ACTIVE",
      },
    ]

    setLocations(nextLocations)
    resetNewLocationForm()
  }

  const removeLocation = (index: number) => {
    const nextLocations = locations.filter((_, i) => i !== index)
    nextLocations.forEach((location, idx) => {
      location.order = idx + 1
    })
    setLocations([...nextLocations])
    if (rowEditIndex === index) {
      setRowEditIndex(null)
      setRowEditLocation(null)
    }
  }

  const moveLocation = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === locations.length - 1)
    ) {
      return
    }

    const nextLocations = [...locations]
    const swapIndex = direction === "up" ? index - 1 : index + 1
    ;[nextLocations[index], nextLocations[swapIndex]] = [
      nextLocations[swapIndex],
      nextLocations[index],
    ]
    nextLocations.forEach((location, idx) => {
      location.order = idx + 1
    })
    setLocations(nextLocations)
  }

  const startRowEdit = (index: number) => {
    setRowEditIndex(index)
    setRowEditLocation({
      ...locations[index],
      tasks: locations[index].tasks.map((task) => ({ ...task })),
    })
  }

  const addTaskToRowEdit = () => {
    setRowEditLocation((prev) =>
      prev
        ? {
            ...prev,
            tasks: [...prev.tasks, createEmptyTask()],
          }
        : prev,
    )
  }

  const updateRowEditTask = (
    taskIndex: number,
    field: keyof ChecklistTaskDraft,
    value: string,
  ) => {
    setRowEditLocation((prev) => {
      if (!prev) return prev
      const nextTasks = [...prev.tasks]
      nextTasks[taskIndex] = { ...nextTasks[taskIndex], [field]: value }
      return { ...prev, tasks: nextTasks }
    })
  }

  const removeRowEditTask = (taskIndex: number) => {
    setRowEditLocation((prev) => {
      if (!prev) return prev
      const nextTasks = prev.tasks.filter((_, index) => index !== taskIndex)
      return { ...prev, tasks: nextTasks }
    })
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null)
    setRowEditLocation(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditLocation) return
    if (!rowEditLocation.location.trim()) return

    const sanitizedTasks = sanitiseTasks(rowEditLocation.tasks)
    const nextLocations = [...locations]
    nextLocations[rowEditIndex] = {
      ...rowEditLocation,
      location: rowEditLocation.location.trim(),
      tasks: sanitizedTasks,
      order: rowEditIndex + 1,
    }

    setLocations(nextLocations)
    cancelRowEdit()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          remarks: description,
          propertyType,
          items: toApiPayload(locations),
        }),
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

  const totalCategories = Array.from(
    new Set(locations.map((location) => location.category)),
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/checklists">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Checklist Template</h1>
          <p className="text-muted-foreground mt-1">
            Create locations and tasks for inspectors to follow
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Template Information</CardTitle>
                <CardDescription>Enter the checklist details</CardDescription>
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

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Checklist Locations</CardTitle>
                    <CardDescription>
                      Add locations and define their inspection tasks
                    </CardDescription>
                  </div>
                  {!showLocationForm && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedTemplate}
                        onValueChange={applyTemplateToNewLocation}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Load template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(AREA_TEMPLATES).map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTemplate("")
                          setShowLocationForm(true)
                          setNewLocation(createEmptyLocation(locations.length + 1))
                          setNewTaskEditIndex(null)
                          setNewTaskDraft(null)
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Location
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {showLocationForm && (
                  <div className="border rounded-lg p-4 mb-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Location *</Label>
                        <Input
                          value={newLocation.location}
                          onChange={(event) =>
                            setNewLocation((prev) => ({
                              ...prev,
                              location: event.target.value,
                            }))
                          }
                          placeholder="e.g., Balcony"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Category *</Label>
                        <Select
                          value={newLocation.category}
                          onValueChange={(value) =>
                            setNewLocation((prev) => ({
                              ...prev,
                              category: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center space-x-2 md:col-span-2">
                        <input
                          type="checkbox"
                          id="new-location-required"
                          checked={newLocation.isRequired}
                          onChange={(event) =>
                            setNewLocation((prev) => ({
                              ...prev,
                              isRequired: event.target.checked,
                            }))
                          }
                          className="rounded"
                        />
                        <Label htmlFor="new-location-required">
                          Required Location
                        </Label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">Tasks</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addTaskToNewLocation}
                          disabled={newTaskEditIndex !== null}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Task
                        </Button>
                      </div>

                      {newLocation.tasks.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Add the tasks and comma-separated details inspectors
                          should follow for this location.
                        </p>
                      )}

                      {newLocation.tasks.map((task, index) => {
                        const isEditing = newTaskEditIndex === index
                        const draftTask = isEditing && newTaskDraft ? newTaskDraft : task

                        return (
                          <div
                            key={`new-task-${task.id ?? index}`}
                            className="border rounded-md p-3"
                          >
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <Label>Task Name *</Label>
                                  <Input
                                    value={draftTask.name}
                                    onChange={(event) =>
                                      updateNewTaskDraft("name", event.target.value)
                                    }
                                    placeholder="e.g., Inspect railings"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Details (comma separated)</Label>
                                  <Input
                                    value={draftTask.details}
                                    onChange={(event) =>
                                      updateNewTaskDraft(
                                        "details",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="e.g., Check height, Check stability"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => cancelNewTaskEdit(index)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => saveNewTaskEdit(index)}
                                    disabled={!draftTask.name.trim()}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="font-medium text-sm">
                                    {task.name.trim() || "Untitled task"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {task.details.trim() || "No details provided"}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => startEditNewTask(index)}
                                    aria-label="Edit task"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeNewLocationTask(index)}
                                    aria-label="Delete task"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetNewLocationForm}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={addLocation}
                          disabled={
                            !newLocation.location.trim() || newTaskEditIndex !== null
                          }
                        >
                          Add Location
                        </Button>
                      </div>
                  </div>
                )}

                {locations.length > 0 ? (
                  <div className="space-y-2">
                    {locations.map((location, index) => {
                      const taskNames = location.tasks
                        .map((task) => task.name.trim())
                        .filter((name) => name.length > 0)

                      return (
                        <div
                          key={location.id || `${location.location}-${index}`}
                          className="border rounded-lg p-3 flex items-start gap-2"
                        >
                          <div className="flex flex-col gap-1 pt-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveLocation(index, "up")}
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
                              onClick={() => moveLocation(index, "down")}
                              disabled={index === locations.length - 1}
                            >
                              ↓
                            </Button>
                          </div>

                          <div className="flex-1">
                            {rowEditIndex === index ? (
                              <div className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-1 md:col-span-2">
                                    <Label>Location *</Label>
                                    <Input
                                      value={rowEditLocation?.location || ""}
                                      onChange={(event) =>
                                        setRowEditLocation((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                location: event.target.value,
                                              }
                                            : prev,
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Category</Label>
                                    <Select
                                      value={rowEditLocation?.category || DEFAULT_CATEGORY}
                                      onValueChange={(value) =>
                                        setRowEditLocation((prev) =>
                                          prev
                                            ? { ...prev, category: value }
                                            : prev,
                                        )
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {CATEGORIES.map((category) => (
                                          <SelectItem key={category} value={category}>
                                            {category}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center space-x-2 md:col-span-2">
                                    <input
                                      type="checkbox"
                                      id={`edit-location-required-${index}`}
                                      checked={!!rowEditLocation?.isRequired}
                                      onChange={(event) =>
                                        setRowEditLocation((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                isRequired: event.target.checked,
                                              }
                                            : prev,
                                        )
                                      }
                                      className="rounded"
                                    />
                                    <Label htmlFor={`edit-location-required-${index}`}>
                                      Required Location
                                    </Label>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <Label className="font-medium">Tasks</Label>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={addTaskToRowEdit}
                                    >
                                      <Plus className="h-4 w-4 mr-2" />
                                      Add Task
                                    </Button>
                                  </div>

                                  {(!rowEditLocation?.tasks ||
                                    rowEditLocation.tasks.length === 0) && (
                                    <p className="text-xs text-muted-foreground">
                                      Add at least one task to describe what needs to
                                      be inspected at this location.
                                    </p>
                                  )}

                                  {rowEditLocation?.tasks?.map((task, taskIndex) => (
                                    <div
                                      key={task.id || `edit-task-${taskIndex}`}
                                      className="border rounded-md p-3 space-y-3 bg-muted/30"
                                    >
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label>Task Name *</Label>
                                          <Input
                                            value={task.name}
                                            onChange={(event) =>
                                              updateRowEditTask(
                                                taskIndex,
                                                "name",
                                                event.target.value,
                                              )
                                            }
                                            placeholder="e.g., Inspect railings"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label>Details (comma separated)</Label>
                                          <Input
                                            value={task.details}
                                            onChange={(event) =>
                                              updateRowEditTask(
                                                taskIndex,
                                                "details",
                                                event.target.value,
                                              )
                                            }
                                            placeholder="e.g., Check height, Check stability"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removeRowEditTask(taskIndex)}
                                          aria-label="Remove task"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={cancelRowEdit}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={saveRowEdit}
                                    disabled={!rowEditLocation?.location.trim()}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-medium">
                                    {location.order}. {location.location}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {taskNames.length > 0
                                      ? taskNames.join(", ")
                                      : "No tasks configured"}
                                  </p>
                                  <div className="flex gap-2 mt-2">
                                    <Badge variant={location.isRequired ? "default" : "secondary"}>
                                      {location.isRequired ? "Required" : "Optional"}
                                    </Badge>
                                    <Badge variant="outline">{location.category}</Badge>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => startRowEdit(index)}
                                    aria-label="Edit location"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeLocation(index)}
                                    aria-label="Remove location"
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
                  !showLocationForm && (
                    <p className="text-muted-foreground text-center py-4">
                      No locations configured yet.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
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
                    disabled={loading || !name || locations.length === 0}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
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

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Build locations first, then add tasks</li>
                  <li>• Use templates to jump-start common areas</li>
                  <li>• Keep task names short and action-oriented</li>
                  <li>• Use comma-separated details for sub-steps</li>
                  <li>• Mark critical locations as required</li>
                </ul>
              </CardContent>
            </Card>

          
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
