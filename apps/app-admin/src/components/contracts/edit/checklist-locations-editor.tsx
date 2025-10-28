"use client"

import { useState } from "react"
import { GripVertical, Pencil, Plus, X } from "lucide-react"
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
import { ChecklistTagLibrary, type ChecklistTag } from "@/components/checklists/checklist-tag-library"
import { showToast } from "@/lib/toast"
import type { ChecklistDraftItem, ChecklistTemplate } from "@/components/contracts/types"
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  buildActionFromTasks,
  createEmptyLocation,
  createEmptyTask,
  mapTemplateItemToDraft,
  sanitiseTasks,
} from "@/components/contracts/edit/checklist-utils"

type Props = {
  templates: ChecklistTemplate[]
  selectedTemplateId: string
  onSelectedTemplateIdChange: (id: string) => void
  checklistItems: ChecklistDraftItem[]
  onChecklistItemsChange: (items: ChecklistDraftItem[]) => void
}

export function ChecklistLocationsEditor(props: Props) {
  const { templates, selectedTemplateId, onSelectedTemplateIdChange, checklistItems, onChecklistItemsChange } = props

  const [showLocationForm, setShowLocationForm] = useState(false)
  const [newLocation, setNewLocation] = useState<ChecklistDraftItem>(createEmptyLocation(Math.max(1, checklistItems.length + 1)))
  const [newTaskEditIndex, setNewTaskEditIndex] = useState<number | null>(null)
  const [newTaskDraft, setNewTaskDraft] = useState<{ name: string; details: string } | null>(null)

  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditItem, setRowEditItem] = useState<ChecklistDraftItem | null>(null)
  const [rowTaskEditIndex, setRowTaskEditIndex] = useState<number | null>(null)
  const [rowTaskDraft, setRowTaskDraft] = useState<{ name: string; details: string } | null>(null)

  const loadTemplate = async (templateId: string) => {
    const id = templateId === 'NONE' ? '' : templateId
    onSelectedTemplateIdChange(id)
    if (!id) {
      onChecklistItemsChange([])
      setShowLocationForm(false)
      setNewLocation(createEmptyLocation(1))
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
      return
    }

    const local = templates.find((template) => template.id === id)
    if (local && Array.isArray(local.items)) {
      const items = local.items.map((item: any, index: number) => mapTemplateItemToDraft(item, index))
      onChecklistItemsChange(items)
      setShowLocationForm(false)
      setNewLocation(createEmptyLocation(items.length + 1))
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
      return
    }

    try {
      const res = await fetch(`/api/checklists/${id}`)
      if (!res.ok) return
      const tpl = await res.json()
      const items = (tpl.items || []).map((item: any, index: number) => mapTemplateItemToDraft(item, index))
      onChecklistItemsChange(items)
      setShowLocationForm(false)
      setNewLocation(createEmptyLocation(items.length + 1))
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } catch {
      /* noop */
    }
  }

  const addBlankChecklistItem = () => {
    setShowLocationForm(true)
    setNewLocation(createEmptyLocation(checklistItems.length + 1))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const moveChecklistItem = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === checklistItems.length - 1)) return
    const items = [...checklistItems]
    const target = direction === "up" ? index - 1 : index + 1
    ;[items[index], items[target]] = [items[target], items[index]]
    items.forEach((item, idx) => {
      item.order = idx + 1
    })
    onChecklistItemsChange(items)
  }

  const removeChecklistItem = (index: number) => {
    const items = checklistItems
      .filter((_, currentIndex) => currentIndex !== index)
      .map((item, idx) => ({ ...item, order: idx + 1 }))
    onChecklistItemsChange(items)
    if (rowEditIndex === index) {
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } else if (rowEditIndex !== null && rowEditIndex > index) {
      setRowEditIndex(rowEditIndex - 1)
    }
  }

  const resetNewLocationForm = () => {
    setShowLocationForm(false)
    setNewLocation(createEmptyLocation(checklistItems.length + 1))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const addLocation = () => {
    if (!newLocation.item.trim()) return

    const sanitizedTasks = sanitiseTasks(newLocation.tasks ?? [])
    const nextLocation: ChecklistDraftItem = {
      ...newLocation,
      item: newLocation.item.trim(),
      category: newLocation.category || DEFAULT_CATEGORY,
      isRequired: newLocation.isRequired ?? true,
      order: checklistItems.length + 1,
      tasks: sanitizedTasks,
      description: buildActionFromTasks(sanitizedTasks),
    }

    onChecklistItemsChange([...(checklistItems || []), nextLocation])
    resetNewLocationForm()
  }

  const addTaskToNewLocation = () => {
    const nextIndex = (newLocation.tasks ?? []).length
    setNewLocation((prev) => ({
      ...prev,
      tasks: [...(prev.tasks ?? []), createEmptyTask()],
    }))
    setNewTaskEditIndex(nextIndex)
    setNewTaskDraft(createEmptyTask())
  }

  const startEditNewTask = (index: number) => {
    const task = newLocation.tasks?.[index]
    if (!task) return
    setNewTaskEditIndex(index)
    setNewTaskDraft({ ...task })
  }

  const updateNewTaskDraft = (field: "name" | "details", value: string) => {
    setNewTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveNewTaskEdit = (index: number) => {
    if (newTaskDraft === null) return
    const trimmedTask = {
      name: newTaskDraft.name.trim(),
      details: newTaskDraft.details.trim(),
    }
    setNewLocation((prev) => {
      const nextTasks = [...(prev.tasks ?? [])]
      nextTasks[index] = trimmedTask
      return { ...prev, tasks: nextTasks }
    })
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const cancelNewTaskEdit = (index: number) => {
    const task = newLocation.tasks?.[index]
    const isNewTask = task && !task.name.trim() && !task.details.trim()
    if (isNewTask) {
      setNewLocation((prev) => ({
        ...prev,
        tasks: (prev.tasks ?? []).filter((_, taskIndex) => taskIndex !== index),
      }))
    }
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const removeNewLocationTask = (index: number) => {
    setNewLocation((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).filter((_, taskIndex) => taskIndex !== index),
    }))
    if (newTaskEditIndex === index) {
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
    } else if (newTaskEditIndex !== null && newTaskEditIndex > index) {
      setNewTaskEditIndex(newTaskEditIndex - 1)
    }
  }

  const startRowEdit = (index: number) => {
    const source = checklistItems[index]
    setRowEditIndex(index)
    setRowEditItem({
      ...source,
      tasks: (source.tasks ?? []).map((task) => ({ ...task })),
      category: source.category || DEFAULT_CATEGORY,
      isRequired: source.isRequired ?? true,
    })
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const addTaskToRowEdit = () => {
    setRowEditItem((prev) => {
      if (!prev) return prev
      const nextTasks = [...(prev.tasks ?? []), createEmptyTask()]
      setRowTaskEditIndex(nextTasks.length - 1)
      setRowTaskDraft(createEmptyTask())
      return { ...prev, tasks: nextTasks }
    })
  }

  const startRowTaskEdit = (index: number) => {
    const task = rowEditItem?.tasks?.[index]
    if (!task) return
    setRowTaskEditIndex(index)
    setRowTaskDraft({ ...task })
  }

  const updateRowTaskDraft = (field: "name" | "details", value: string) => {
    setRowTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveRowTaskEdit = (index: number) => {
    if (!rowTaskDraft) return
    const trimmedTask = {
      name: rowTaskDraft.name.trim(),
      details: rowTaskDraft.details.trim(),
    }
    setRowEditItem((prev) => {
      if (!prev) return prev
      const nextTasks = [...(prev.tasks ?? [])]
      nextTasks[index] = trimmedTask
      return { ...prev, tasks: nextTasks }
    })
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const cancelRowTaskEdit = (index: number) => {
    const task = rowEditItem?.tasks?.[index]
    const isNewTask = task && !task.name.trim() && !task.details.trim()
    if (isNewTask) {
      setRowEditItem((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          tasks: (prev.tasks ?? []).filter((_, taskIndex) => taskIndex !== index),
        }
      })
    }
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const removeRowEditTask = (taskIndex: number) => {
    setRowEditItem((prev) => {
      if (!prev) return prev
      const nextTasks = (prev.tasks ?? []).filter((_, index) => index !== taskIndex)
      return { ...prev, tasks: nextTasks }
    })
    if (rowTaskEditIndex === taskIndex) {
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } else if (rowTaskEditIndex !== null && rowTaskEditIndex > taskIndex) {
      setRowTaskEditIndex(rowTaskEditIndex - 1)
    }
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null)
    setRowEditItem(null)
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditItem) return
    if (!rowEditItem.item.trim()) return
    if (rowTaskEditIndex !== null) return

    const sanitizedTasks = sanitiseTasks(rowEditItem.tasks ?? [])
    const items = [...checklistItems]
    items[rowEditIndex] = {
      ...rowEditItem,
      item: rowEditItem.item.trim(),
      category: rowEditItem.category || DEFAULT_CATEGORY,
      isRequired: rowEditItem.isRequired ?? true,
      tasks: sanitizedTasks,
      description: buildActionFromTasks(sanitizedTasks),
      order: rowEditIndex + 1,
    }
    onChecklistItemsChange(items)
    cancelRowEdit()
  }

  const handleRowEditChange = (updates: Partial<ChecklistDraftItem>) => {
    setRowEditItem((previous) =>
      previous
        ? {
            ...previous,
            ...updates,
          }
        : previous,
    )
  }

  const buildTasksFromTag = (tag: ChecklistTag) => {
    const rawTemplates = tag.taskTemplates as unknown
    const templates = Array.isArray(rawTemplates)
      ? rawTemplates
      : rawTemplates && typeof rawTemplates === 'object' && Array.isArray((rawTemplates as any).templates)
      ? (rawTemplates as any).templates
      : []
    if (templates.length === 0) {
      return [{ name: tag.label, details: "" }]
    }

    return templates.map((entry) => {
      const name = entry.label?.trim() || tag.label
      const details = Array.isArray(entry.subtasks) && entry.subtasks.length > 0
        ? entry.subtasks.map((item) => item.trim()).filter(Boolean).join(', ')
        : ''
      return { name, details }
    })
  }

  const applyTagToChecklist = (tag: ChecklistTag) => {
    const tasksToAdd = buildTasksFromTag(tag)
    if (tasksToAdd.length === 0) return

    if (rowEditIndex === null && !showLocationForm) {
      showToast({
        title: "Select a location first",
        description: "Pick or add a checklist location before applying a tag.",
        variant: "error",
      })
      return
    }

    if (rowEditIndex !== null) {
      setRowEditItem((previous) =>
        previous
          ? {
              ...previous,
              tasks: [...(previous.tasks ?? []), ...tasksToAdd],
              description: buildActionFromTasks([...(previous.tasks ?? []), ...tasksToAdd]),
            }
          : previous,
      )
      return
    }

    if (showLocationForm) {
      setNewLocation((previous) => ({
        ...previous,
        tasks: [...(previous.tasks ?? []), ...tasksToAdd],
        description: buildActionFromTasks([...(previous.tasks ?? []), ...tasksToAdd]),
      }))
      return
    }

    if (!showLocationForm) {
      setShowLocationForm(true)
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setNewLocation(() => {
        const base = createEmptyLocation(checklistItems.length + 1)
        const tasks = [...(base.tasks ?? []), ...tasksToAdd]
        return {
          ...base,
          tasks,
          description: buildActionFromTasks(tasks),
        }
      })
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Checklist Locations</h3>
          <p className="text-sm text-muted-foreground">
            Select a template or edit locations and tasks for this contract
          </p>
        </div>
        <Select value={selectedTemplateId} onValueChange={loadTemplate}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Load template..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">None</SelectItem>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ChecklistTagLibrary onApplyTag={applyTagToChecklist} />
        <Button type="button" variant="outline" onClick={addBlankChecklistItem} disabled={showLocationForm || newTaskEditIndex !== null}>
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      {showLocationForm && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Input
                value={newLocation.item}
                onChange={(event) =>
                  setNewLocation((prev) => ({
                    ...prev,
                    item: event.target.value,
                  }))
                }
                placeholder="e.g., Balcony"
              />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={newLocation.category || DEFAULT_CATEGORY}
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
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                id="edit-new-location-required"
                checked={newLocation.isRequired ?? true}
                onChange={(event) =>
                  setNewLocation((prev) => ({
                    ...prev,
                    isRequired: event.target.checked,
                  }))
                }
                className="rounded"
              />
              <Label htmlFor="edit-new-location-required">Required Location</Label>
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

            {(newLocation.tasks ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add the task names and optional details inspectors should follow for this location.
              </p>
            )}

            {(newLocation.tasks ?? []).map((task, index) => {
              const isEditing = newTaskEditIndex === index
              const draftTask = isEditing && newTaskDraft ? newTaskDraft : task

              return (
                <div key={`edit-new-task-${index}`} className="border rounded-md p-3">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Task Name *</Label>
                        <Input
                          value={draftTask.name}
                          onChange={(event) => updateNewTaskDraft("name", event.target.value)}
                          placeholder="e.g., Inspect railings"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Details (optional)</Label>
                        <Input
                          value={draftTask.details}
                          onChange={(event) => updateNewTaskDraft("details", event.target.value)}
                          placeholder="e.g., Check alignment, Test locks"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => cancelNewTaskEdit(index)}>
                          Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={() => saveNewTaskEdit(index)} disabled={!draftTask.name.trim()}>
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{task.name.trim() || "Untitled task"}</p>
                        {task.details.trim() ? (
                          <p className="text-xs text-muted-foreground">{task.details.trim()}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => startEditNewTask(index)} aria-label="Edit task">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeNewLocationTask(index)} aria-label="Remove task">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetNewLocationForm}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={addLocation} disabled={!newLocation.item.trim() || newTaskEditIndex !== null}>
              Add Location
            </Button>
          </div>
        </div>
      )}

      {checklistItems.length > 0 ? (
        <div className="space-y-2">
          {checklistItems.map((location, index) => {
            const taskSummaries = (location.tasks ?? [])
              .map((task) => {
                const name = task.name.trim()
                const details = task.details.trim()
                if (!name && !details) return ""
                return details ? `${name} (${details})` : name
              })
              .filter((entry) => entry.length > 0)

            return (
              <div key={location.item ? `${location.item}-${index}` : `location-${index}`} className="border rounded-lg p-3 flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveChecklistItem(index, "up")} disabled={index === 0}>
                    ↑
                  </Button>
                  <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveChecklistItem(index, "down")} disabled={index === checklistItems.length - 1}>
                    ↓
                  </Button>
                </div>

                <div className="flex-1">
                  {rowEditIndex === index ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Location *</Label>
                          <Input value={rowEditItem?.item || ""} onChange={(event) => handleRowEditChange({ item: event.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Category</Label>
                          <Select value={rowEditItem?.category || DEFAULT_CATEGORY} onValueChange={(value) => handleRowEditChange({ category: value })}>
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
                        <div className="flex items-center gap-2 md:col-span-2">
                          <input
                            type="checkbox"
                            id={`edit-location-required-${index}`}
                            checked={rowEditItem?.isRequired ?? true}
                            onChange={(event) => handleRowEditChange({ isRequired: event.target.checked })}
                            className="rounded"
                          />
                          <Label htmlFor={`edit-location-required-${index}`}>Required Location</Label>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Tasks</Label>
                          <Button type="button" variant="outline" size="sm" onClick={addTaskToRowEdit} disabled={rowTaskEditIndex !== null}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Task
                          </Button>
                        </div>

                        {(!rowEditItem?.tasks || rowEditItem.tasks.length === 0) && (
                          <p className="text-xs text-muted-foreground">Add at least one task to describe what needs to be inspected.</p>
                        )}

                        {rowEditItem?.tasks?.map((task, taskIndex) => {
                          const isEditing = rowTaskEditIndex === taskIndex
                          const draftTask = isEditing && rowTaskDraft ? rowTaskDraft : task

                          return (
                            <div key={task.id || `edit-task-${taskIndex}`} className="border rounded-md p-3">
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <Label>Task Name *</Label>
                                    <Input value={draftTask.name} onChange={(event) => updateRowTaskDraft("name", event.target.value)} placeholder="e.g., Inspect balcony doors" />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Details (optional)</Label>
                                    <Input value={draftTask.details} onChange={(event) => updateRowTaskDraft("details", event.target.value)} placeholder="e.g., Check alignment, Test locks" />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => cancelRowTaskEdit(taskIndex)}>
                                      Cancel
                                    </Button>
                                    <Button type="button" size="sm" onClick={() => saveRowTaskEdit(taskIndex)} disabled={!draftTask.name.trim()}>
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="font-medium text-sm">{task.name.trim() || "Untitled task"}</p>
                                    {task.details.trim() ? <p className="text-xs text-muted-foreground">{task.details.trim()}</p> : null}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button type="button" variant="ghost" size="icon" onClick={() => startRowTaskEdit(taskIndex)} aria-label="Edit task">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRowEditTask(taskIndex)} aria-label="Remove task">
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={cancelRowEdit}>
                          Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={saveRowEdit} disabled={!rowEditItem?.item.trim() || rowTaskEditIndex !== null}>
                          Save Location
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{location.item}</p>
                        {taskSummaries.length > 0 ? (
                          <p className="text-sm text-muted-foreground">{taskSummaries.join(", ")}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">No tasks specified</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant={location.isRequired ? "default" : "secondary"}>
                            {location.isRequired ? "Required" : "Optional"}
                          </Badge>
                          <Badge variant="outline">{location.category || DEFAULT_CATEGORY}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => startRowEdit(index)} aria-label="Edit location">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeChecklistItem(index)} aria-label="Remove location">
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
          <p className="text-sm text-muted-foreground">No locations configured yet. Load a template or add one manually.</p>
        )
      )}
    </div>
  )
}
