"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react"
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  ChecklistLocationDraft,
  ChecklistTaskDraft,
  createEmptyLocation,
  createEmptyTask,
  sanitiseTasks,
} from "@/components/checklists/edit/checklist-utils"

type Props = {
  locations: ChecklistLocationDraft[]
  onLocationsChange: (locations: ChecklistLocationDraft[]) => void
}

export function ChecklistTemplateLocationsEditor({ locations, onLocationsChange }: Props) {
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [newLocation, setNewLocation] = useState<ChecklistLocationDraft>(createEmptyLocation(Math.max(1, locations.length + 1)))
  const [newTaskEditIndex, setNewTaskEditIndex] = useState<number | null>(null)
  const [newTaskDraft, setNewTaskDraft] = useState<ChecklistTaskDraft | null>(null)

  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditLocation, setRowEditLocation] = useState<ChecklistLocationDraft | null>(null)
  const [rowTaskEditIndex, setRowTaskEditIndex] = useState<number | null>(null)
  const [rowTaskDraft, setRowTaskDraft] = useState<ChecklistTaskDraft | null>(null)

  const addTaskToNewLocation = () => {
    const nextIndex = (newLocation.tasks ?? []).length
    setNewLocation((prev) => ({ ...prev, tasks: [...(prev.tasks ?? []), createEmptyTask()] }))
    setNewTaskEditIndex(nextIndex)
    setNewTaskDraft(createEmptyTask())
  }

  const removeNewLocationTask = (index: number) => {
    setNewLocation((prev) => ({ ...prev, tasks: (prev.tasks ?? []).filter((_, i) => i !== index) }))
    if (newTaskEditIndex === index) { setNewTaskEditIndex(null); setNewTaskDraft(null) }
    else if (newTaskEditIndex !== null && newTaskEditIndex > index) setNewTaskEditIndex(newTaskEditIndex - 1)
  }

  const startEditNewTask = (index: number) => {
    const task = newLocation.tasks?.[index]
    setNewTaskEditIndex(index)
    setNewTaskDraft(task ? { ...task } : createEmptyTask())
  }

  const updateNewTaskDraft = (field: keyof ChecklistTaskDraft, value: string) => {
    setNewTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveNewTaskEdit = (index: number) => {
    if (!newTaskDraft) return
    const trimmed: ChecklistTaskDraft = { ...newTaskDraft, name: newTaskDraft.name.trim(), details: newTaskDraft.details.trim() }
    setNewLocation((prev) => { const tasks = [...(prev.tasks ?? [])]; tasks[index] = trimmed; return { ...prev, tasks } })
    setNewTaskEditIndex(null); setNewTaskDraft(null)
  }

  const cancelNewTaskEdit = (index: number) => {
    const task = newLocation.tasks?.[index]
    const isNew = task && !task.id && !task.name && !task.details
    if (isNew) setNewLocation((prev) => ({ ...prev, tasks: (prev.tasks ?? []).filter((_, i) => i !== index) }))
    setNewTaskEditIndex(null); setNewTaskDraft(null)
  }

  const resetNewLocationForm = () => {
    setShowLocationForm(false)
    setNewLocation(createEmptyLocation(locations.length + 1))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const addLocation = () => {
    if (!newLocation.location.trim()) return
    const sanitizedTasks = sanitiseTasks(newLocation.tasks ?? [])
    const next: ChecklistLocationDraft = { ...newLocation, location: newLocation.location.trim(), tasks: sanitizedTasks, status: newLocation.status ?? "ACTIVE", order: locations.length + 1 }
    onLocationsChange([...(locations || []), next])
    resetNewLocationForm()
  }

  const removeLocation = (index: number) => {
    const next = (locations || []).filter((_, i) => i !== index).map((loc, i2) => ({ ...loc, order: i2 + 1 }))
    onLocationsChange(next)
    if (rowEditIndex === index) { setRowEditIndex(null); setRowEditLocation(null); setRowTaskEditIndex(null); setRowTaskDraft(null) }
    else if (rowEditIndex !== null && rowEditIndex > index) setRowEditIndex(rowEditIndex - 1)
  }

  const moveLocation = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === locations.length - 1)) return
    const next = [...locations]
    const swap = direction === "up" ? index - 1 : index + 1
    ;[next[index], next[swap]] = [next[swap], next[index]]
    next.forEach((l, i) => { l.order = i + 1 })
    onLocationsChange(next)
  }

  const startRowEdit = (index: number) => {
    setRowEditIndex(index)
    setRowEditLocation({ ...locations[index], tasks: (locations[index].tasks || []).map((t) => ({ ...t })) })
    setRowTaskEditIndex(null); setRowTaskDraft(null)
  }

  const addTaskToRowEdit = () => {
    setRowEditLocation((prev) => { if (!prev) return prev; const tasks=[...(prev.tasks||[]), createEmptyTask()]; setRowTaskEditIndex(tasks.length-1); setRowTaskDraft(createEmptyTask()); return { ...prev, tasks }})
  }

  const startRowTaskEdit = (taskIndex: number) => {
    setRowEditLocation((prev) => { if (!prev) return prev; const task=prev.tasks[taskIndex]; setRowTaskEditIndex(taskIndex); setRowTaskDraft({ ...task }); return prev })
  }

  const updateRowTaskDraft = (field: keyof ChecklistTaskDraft, value: string) => {
    setRowTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveRowTaskEdit = (taskIndex: number) => {
    if (!rowTaskDraft) return
    const trimmed: ChecklistTaskDraft = { ...rowTaskDraft, name: rowTaskDraft.name.trim(), details: rowTaskDraft.details.trim() }
    setRowEditLocation((prev) => { if (!prev) return prev; const tasks=[...prev.tasks]; tasks[taskIndex]=trimmed; return { ...prev, tasks } })
    setRowTaskEditIndex(null); setRowTaskDraft(null)
  }

  const removeRowEditTask = (taskIndex: number) => {
    setRowEditLocation((prev) => { if (!prev) return prev; const tasks=prev.tasks.filter((_,i)=>i!==taskIndex); return { ...prev, tasks } })
    if (rowTaskEditIndex === taskIndex) { setRowTaskEditIndex(null); setRowTaskDraft(null) }
    else if (rowTaskEditIndex !== null && rowTaskEditIndex > taskIndex) setRowTaskEditIndex(rowTaskEditIndex - 1)
  }

  const cancelRowTaskEdit = (taskIndex: number) => {
    const task = rowEditLocation?.tasks?.[taskIndex]
    const isNew = task && !task.id && !task.name && !task.details
    if (isNew) setRowEditLocation((prev) => { if (!prev) return prev; return { ...prev, tasks: prev.tasks.filter((_,i)=>i!==taskIndex) } })
    setRowTaskEditIndex(null); setRowTaskDraft(null)
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null); setRowEditLocation(null); setRowTaskEditIndex(null); setRowTaskDraft(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditLocation) return
    if (!rowEditLocation.location.trim()) return
    if (rowTaskEditIndex !== null) return
    const sanitized = sanitiseTasks(rowEditLocation.tasks || [])
    const next = [...locations]
    next[rowEditIndex] = { ...rowEditLocation, location: rowEditLocation.location.trim(), tasks: sanitized, order: rowEditIndex + 1 }
    onLocationsChange(next)
    cancelRowEdit()
  }

  const totalCategories = Array.from(new Set(locations.map((l) => l.category)))

  return (
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
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowLocationForm(true); setNewLocation(createEmptyLocation(locations.length + 1)); setNewTaskEditIndex(null); setNewTaskDraft(null) }}>
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
                <Input value={newLocation.location} onChange={(e) => setNewLocation((prev) => ({ ...prev, location: e.target.value }))} placeholder="e.g., Balcony" />
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={newLocation.category || DEFAULT_CATEGORY} onValueChange={(v) => setNewLocation((prev) => ({ ...prev, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 md:col-span-2">
                <input type="checkbox" id="new-location-required" checked={newLocation.isRequired ?? true} onChange={(e) => setNewLocation((prev) => ({ ...prev, isRequired: e.target.checked }))} className="rounded" />
                <Label htmlFor="new-location-required">Required Location</Label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Tasks</Label>
                <Button type="button" variant="outline" size="sm" onClick={addTaskToNewLocation} disabled={newTaskEditIndex !== null}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>

              {(newLocation.tasks ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Add the task names and optional details inspectors should follow for this location.</p>
              )}

              {(newLocation.tasks ?? []).map((task, index) => {
                const isEditing = newTaskEditIndex === index
                const draftTask = isEditing && newTaskDraft ? newTaskDraft : task
                return (
                  <div key={`new-task-${index}`} className="border rounded-md p-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Task Name *</Label>
                          <Input value={draftTask.name} onChange={(e) => updateNewTaskDraft("name", e.target.value)} placeholder="e.g., Inspect balcony doors" />
                        </div>
                        <div className="space-y-2">
                          <Label>Details (optional)</Label>
                          <Input value={draftTask.details} onChange={(e) => updateNewTaskDraft("details", e.target.value)} placeholder="e.g., Check alignment, Test locks" />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => cancelNewTaskEdit(index)}>Cancel</Button>
                          <Button type="button" size="sm" onClick={() => saveNewTaskEdit(index)} disabled={!draftTask.name.trim()}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{task.name.trim() || "Untitled task"}</p>
                          {task.details.trim() ? <p className="text-xs text-muted-foreground">{task.details.trim()}</p> : null}
                        </div>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => startEditNewTask(index)} aria-label="Edit task"><Pencil className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeNewLocationTask(index)} aria-label="Delete task"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetNewLocationForm}>Cancel</Button>
              <Button type="button" size="sm" onClick={addLocation} disabled={!newLocation.location.trim() || newTaskEditIndex !== null}>Add Location</Button>
            </div>
          </div>
        )}

        {locations.length > 0 ? (
          <div className="space-y-2">
            {locations.map((location, index) => {
              const taskSummaries = (location.tasks ?? [])
                .map((task) => {
                  const name = task.name.trim(); const details = task.details.trim(); if (!name && !details) return ""; return details ? `${name} (${details})` : name
                })
                .filter(Boolean)
              return (
                <div key={location.id || `${location.location}-${index}`} className="border rounded-lg p-3 flex items-start gap-2">
                  <div className="flex flex-col gap-1 pt-1">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveLocation(index, "up")} disabled={index === 0}>↑</Button>
                    <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveLocation(index, "down")} disabled={index === locations.length - 1}>↓</Button>
                  </div>
                  <div className="flex-1">
                    {rowEditIndex === index ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Location *</Label>
                            <Input value={rowEditLocation?.location || ""} onChange={(e) => setRowEditLocation((prev)=> prev ? { ...prev, location: e.target.value } : prev)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Category</Label>
                            <Select value={rowEditLocation?.category || DEFAULT_CATEGORY} onValueChange={(v) => setRowEditLocation((prev)=> prev ? { ...prev, category: v } : prev)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((category) => (<SelectItem key={category} value={category}>{category}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center space-x-2 md:col-span-2">
                            <input type="checkbox" id={`edit-location-required-${index}`} checked={!!rowEditLocation?.isRequired} onChange={(e) => setRowEditLocation((prev)=> prev ? { ...prev, isRequired: e.target.checked } : prev)} className="rounded" />
                            <Label htmlFor={`edit-location-required-${index}`}>Required Location</Label>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">Tasks</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addTaskToRowEdit} disabled={rowTaskEditIndex !== null}><Plus className="h-4 w-4 mr-2" />Add Task</Button>
                          </div>

                          {(!rowEditLocation?.tasks || rowEditLocation.tasks.length === 0) && (
                            <p className="text-xs text-muted-foreground">Add at least one task to describe what needs to be inspected at this location.</p>
                          )}

                          {rowEditLocation?.tasks?.map((task, taskIndex) => {
                            const isEditing = rowTaskEditIndex === taskIndex
                            const draftTask = isEditing && rowTaskDraft ? rowTaskDraft : task
                            return (
                              <div key={task.id || `edit-task-${taskIndex}`} className="border rounded-md p-3">
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <div className="space-y-2">
                                      <Label>Task Name *</Label>
                                      <Input value={draftTask.name} onChange={(e) => updateRowTaskDraft("name", e.target.value)} placeholder="e.g., Inspect balcony doors" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Details (optional)</Label>
                                      <Input value={draftTask.details} onChange={(e) => updateRowTaskDraft("details", e.target.value)} placeholder="e.g., Check alignment, Test locks" />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <Button type="button" variant="outline" size="sm" onClick={() => cancelRowTaskEdit(taskIndex)}>Cancel</Button>
                                      <Button type="button" size="sm" onClick={() => saveRowTaskEdit(taskIndex)} disabled={!draftTask.name.trim()}>Save</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <p className="font-medium text-sm">{task.name.trim() || "Untitled task"}</p>
                                      {task.details.trim() && (<p className="text-xs text-muted-foreground">{task.details.trim()}</p>)}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button type="button" variant="ghost" size="icon" onClick={() => startRowTaskEdit(taskIndex)} aria-label="Edit task"><Pencil className="h-4 w-4" /></Button>
                                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRowEditTask(taskIndex)} aria-label="Delete task"><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={cancelRowEdit}>Cancel</Button>
                          <Button type="button" size="sm" onClick={saveRowEdit} disabled={!rowEditLocation?.location.trim() || rowTaskEditIndex !== null}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{location.order}. {location.location}</p>
                          <p className="text-sm text-muted-foreground">{taskSummaries.length > 0 ? taskSummaries.join(", ") : "No tasks configured"}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant={location.isRequired ? "default" : "secondary"}>{location.isRequired ? "Required" : "Optional"}</Badge>
                            <Badge variant="outline">{location.category || DEFAULT_CATEGORY}</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => setRowEditIndex(index)} aria-label="Edit location"><Pencil className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeLocation(index)} aria-label="Remove location"><X className="h-4 w-4" /></Button>
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
            <p className="text-sm text-muted-foreground">No locations configured yet. Add one manually.</p>
          )
        )}

        {locations.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {totalCategories.map((category) => (
              <Badge key={category} variant="outline">
                {category}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

