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
import {
  ArrowLeft,
  Plus,
  X,
  Loader2,
  Save,
  GripVertical,
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
  description?: string
  propertyType: string
  status: string
  items: ChecklistResponseItem[]
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
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [newLocation, setNewLocation] = useState<ChecklistLocationDraft>(
    createEmptyLocation(1),
  )
  const [newTaskEditIndex, setNewTaskEditIndex] = useState<number | null>(null)
  const [newTaskDraft, setNewTaskDraft] =
    useState<ChecklistTaskDraft | null>(null)

  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditLocation, setRowEditLocation] =
    useState<ChecklistLocationDraft | null>(null)
  const [rowTaskEditIndex, setRowTaskEditIndex] = useState<number | null>(null)
  const [rowTaskDraft, setRowTaskDraft] =
    useState<ChecklistTaskDraft | null>(null)

  useEffect(() => {
    const loadChecklist = async () => {
      const resolvedParams = await params
      setChecklistId(resolvedParams.id)

      try {
        const response = await fetch(`/api/checklists/${resolvedParams.id}`)
        if (!response.ok) throw new Error("Failed to fetch checklist")

        const checklist: ChecklistResponse = await response.json()
        setName(checklist.name)
        setDescription(checklist.description || "")
        setPropertyType(checklist.propertyType)
        setStatus(checklist.status)

        const mappedLocations = (checklist.items || []).map(mapResponseItemToDraft)
        setLocations(mappedLocations)
        setNewLocation(createEmptyLocation(mappedLocations.length + 1))
        setNewTaskEditIndex(null)
        setNewTaskDraft(null)
        setRowTaskEditIndex(null)
        setRowTaskDraft(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load checklist")
      } finally {
        setLoading(false)
      }
    }

    loadChecklist()
  }, [params])

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
    if (!newTaskDraft) return
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

  const resetNewLocationForm = () => {
    setShowLocationForm(false)
    setNewLocation(createEmptyLocation(locations.length + 1))
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
        status: newLocation.status ?? "ACTIVE",
        order: locations.length + 1,
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
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } else if (rowEditIndex !== null && rowEditIndex > index) {
      setRowEditIndex(rowEditIndex - 1)
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
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const addTaskToRowEdit = () => {
    setRowEditLocation((prev) => {
      if (!prev) return prev
      const nextTasks = [...prev.tasks, createEmptyTask()]
      setRowTaskEditIndex(nextTasks.length - 1)
      setRowTaskDraft(createEmptyTask())
      return { ...prev, tasks: nextTasks }
    })
  }

  const startRowTaskEdit = (taskIndex: number) => {
    setRowEditLocation((prev) => {
      if (!prev) return prev
      const task = prev.tasks[taskIndex]
      setRowTaskEditIndex(taskIndex)
      setRowTaskDraft({ ...task })
      return prev
    })
  }

  const updateRowTaskDraft = (
    field: keyof ChecklistTaskDraft,
    value: string,
  ) => {
    setRowTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveRowTaskEdit = (taskIndex: number) => {
    if (!rowTaskDraft) return
    const trimmedTask: ChecklistTaskDraft = {
      ...rowTaskDraft,
      name: rowTaskDraft.name.trim(),
      details: rowTaskDraft.details.trim(),
    }
    setRowEditLocation((prev) => {
      if (!prev) return prev
      const nextTasks = [...prev.tasks]
      nextTasks[taskIndex] = trimmedTask
      return { ...prev, tasks: nextTasks }
    })
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const removeRowEditTask = (taskIndex: number) => {
    setRowEditLocation((prev) => {
      if (!prev) return prev
      const nextTasks = prev.tasks.filter((_, index) => index !== taskIndex)
      return { ...prev, tasks: nextTasks }
    })
    if (rowTaskEditIndex === taskIndex) {
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } else if (rowTaskEditIndex !== null && rowTaskEditIndex > taskIndex) {
      setRowTaskEditIndex(rowTaskEditIndex - 1)
    }
  }

  const cancelRowTaskEdit = (taskIndex: number) => {
    const task = rowEditLocation?.tasks?.[taskIndex]
    const isNewTask = task && !task.id && !task.name && !task.details
    if (isNewTask) {
      setRowEditLocation((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          tasks: prev.tasks.filter((_, index) => index !== taskIndex),
        }
      })
    }
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null)
    setRowEditLocation(null)
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditLocation) return
    if (!rowEditLocation.location.trim()) return
    if (rowTaskEditIndex !== null) return

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

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Checklist Locations</CardTitle>
                    <CardDescription>
                      Define each location and the tasks inspectors must complete
                    </CardDescription>
                  </div>
                  {!showLocationForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowLocationForm(true)
                        setNewLocation(createEmptyLocation(locations.length + 1))
                        setNewTaskEditIndex(null)
                        setNewTaskDraft(null)
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location
                    </Button>
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
                          placeholder="e.g., Living & Dining"
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
                          Add task names and comma-separated details to describe
                          what inspectors should perform.
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
                                    placeholder="e.g., Inspect windows"
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
                                    placeholder="e.g., Check hinges, Verify locks"
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
                                  <div className="space-y-1">
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
                                      disabled={rowTaskEditIndex !== null}
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

                                  {rowEditLocation?.tasks?.map((task, taskIndex) => {
                                    const isEditingTask = rowTaskEditIndex === taskIndex
                                    const draftTask =
                                      isEditingTask && rowTaskDraft ? rowTaskDraft : task

                                    return (
                                      <div
                                        key={task.id || `edit-task-${taskIndex}`}
                                        className="border rounded-md p-3"
                                      >
                                        {isEditingTask ? (
                                          <div className="space-y-3">
                                            <div className="space-y-2">
                                              <Label>Task Name *</Label>
                                              <Input
                                                value={draftTask.name}
                                                onChange={(event) =>
                                                  updateRowTaskDraft(
                                                    "name",
                                                    event.target.value,
                                                  )
                                                }
                                                placeholder="e.g., Inspect balcony doors"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label>Details (comma separated)</Label>
                                              <Input
                                                value={draftTask.details}
                                                onChange={(event) =>
                                                  updateRowTaskDraft(
                                                    "details",
                                                    event.target.value,
                                                  )
                                                }
                                                placeholder="e.g., Check alignment, Test locks"
                                              />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => cancelRowTaskEdit(taskIndex)}
                                              >
                                                Cancel
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => saveRowTaskEdit(taskIndex)}
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
                                                onClick={() => startRowTaskEdit(taskIndex)}
                                                aria-label="Edit task"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeRowEditTask(taskIndex)}
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
                                    onClick={cancelRowEdit}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={saveRowEdit}
                                    disabled={
                                      !rowEditLocation?.location.trim() ||
                                      rowTaskEditIndex !== null
                                    }
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
                                    {location.status && (
                                      <Badge
                                        variant={
                                          location.status === "ACTIVE"
                                            ? "success"
                                            : "secondary"
                                        }
                                      >
                                        {location.status}
                                      </Badge>
                                    )}
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
