"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import AddRemarkForm from "@/components/item-entries-dialog/add-remark-form"
import EntryCard from "@/components/item-entries-dialog/entry-card"
import { DisplayEntry, Entry, PendingMediaFile, Task } from "@/components/item-entries-dialog/types"
import { extractEntryMedia, mergeMediaLists, stringsToAttachments } from "@/lib/media-utils"
import { useRouter } from "next/navigation"

type Props = {
  itemId: string
  workOrderId: string
  entries?: Entry[]
  tasks?: Task[]
  locations?: Array<{
    id: string
    name?: string | null
    tasks?: Task[] | null
  }>
  itemName?: string
  triggerLabel?: string | ((count: number) => string)
}

export default function ItemEntriesDialog({
  itemId,
  workOrderId,
  entries = [],
  tasks = [],
  locations = [],
  itemName,
  triggerLabel,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [localEntries, setLocalEntries] = useState<Entry[]>(entries)
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)
  const [addingRemark, setAddingRemark] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  // Per-location: map subtask -> condition for bulk update
  const [conditionsByTask, setConditionsByTask] = useState<Record<string, string>>({})
  const [remarkText, setRemarkText] = useState<string>("")
  const [causeText, setCauseText] = useState<string>("")
  const [resolutionText, setResolutionText] = useState<string>("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [photoFiles, setPhotoFiles] = useState<PendingMediaFile[]>([])
  const [videoFiles, setVideoFiles] = useState<PendingMediaFile[]>([])
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingRemarkText, setEditingRemarkText] = useState<string>("")
  const [editingCondition, setEditingCondition] = useState<string>("")
  const [editingConditionsByTask, setEditingConditionsByTask] = useState<Record<string, string>>({})
  const [editingTasksForLocation, setEditingTasksForLocation] = useState<Task[]>([])
  const [editingCauseText, setEditingCauseText] = useState<string>("")
  const [editingResolutionText, setEditingResolutionText] = useState<string>("")
  const [editingError, setEditingError] = useState<string | null>(null)
  const [editingSubmitting, setEditingSubmitting] = useState(false)
  const [editingMediaCaptions, setEditingMediaCaptions] = useState<Record<string, string>>({})

  useEffect(() => {
        setLocalEntries(entries)
  }, [entries])

  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const locationOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; tasks: Task[] }>()
    const seenTaskIds = new Set<string>()

    locations.forEach((location) => {
      if (!location?.id) return
      const displayName = typeof location.name === "string" && location.name.trim().length > 0 ? location.name.trim() : "Location"
      const locationTasks = Array.isArray(location.tasks)
        ? (location.tasks.filter((task: any) => task && typeof task.id === "string") as Task[])
        : []
      locationTasks.forEach((task) => seenTaskIds.add(task.id))
      map.set(location.id, {
        id: location.id,
        name: displayName,
        tasks: locationTasks,
      })
    })

    const orphanTasks: Task[] = []

    localTasks.forEach((task) => {
      if (!task?.id || seenTaskIds.has(task.id)) return
      const locationId = task.location?.id
      if (locationId) {
        const name = task.location?.name && task.location.name.trim().length > 0 ? task.location.name.trim() : 'Location'
        if (!map.has(locationId)) {
          map.set(locationId, { id: locationId, name, tasks: [] })
        }
        map.get(locationId)!.tasks.push(task)
        seenTaskIds.add(task.id)
        return
      }
      orphanTasks.push(task)
      seenTaskIds.add(task.id)
    })

    if (orphanTasks.length > 0) {
      const fallbackName = itemName ? `${itemName} — General` : 'General'
      map.set('unassigned', {
        id: 'unassigned',
        name: fallbackName,
        tasks: orphanTasks,
      })
    }

    return Array.from(map.values())
  }, [locations, localTasks, itemName])

  const hasSelectableTasks = useMemo(() => locationOptions.some((location) => location.tasks.length > 0), [locationOptions])

  const availableTasks = useMemo(() => {
    if (!selectedLocationId) return []
    return locationOptions.find((location) => location.id === selectedLocationId)?.tasks ?? []
  }, [locationOptions, selectedLocationId])

  useEffect(() => {
    if (!addingRemark) return
    if (!selectedLocationId) return

    if (!locationOptions.some((location) => location.id === selectedLocationId)) {
      setSelectedLocationId("")
      setConditionsByTask({})
    }
  }, [addingRemark, locationOptions, selectedLocationId])

  useEffect(() => {
    if (!addingRemark) return

    if (!selectedLocationId || availableTasks.length === 0) {
      setConditionsByTask({})
      return
    }

    // Initialize all subtasks under the selected location to GOOD by default
    const next: Record<string, string> = {}
    availableTasks.forEach((t) => { if (t?.id) next[t.id] = '' })
    setConditionsByTask(next)
  }, [addingRemark, selectedLocationId, availableTasks])

  const resetForm = () => {
    setAddingRemark(false)
    setSelectedLocationId("")
    setConditionsByTask({})
    setRemarkText("")
    setCauseText("")
    setResolutionText("")
    setFormError(null)
    setPhotoFiles([])
    setVideoFiles([])
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  const cancelEditing = () => {
    setEditingEntryId(null)
    setEditingRemarkText("")
    setEditingCondition("")
    setEditingCauseText("")
    setEditingResolutionText("")
    setEditingError(null)
    setEditingSubmitting(false)
    setEditingMediaCaptions({})
  }

  const beginEditingEntry = (entry: DisplayEntry) => {
    resetForm()
    setEditingEntryId(entry.id)
    setEditingRemarkText(entry.remarks ?? "")
    const initialCondition = entry.condition ?? entry.task?.condition ?? "GOOD"
    setEditingCondition(initialCondition || "")
    setEditingCauseText(entry.cause ?? "")
    setEditingResolutionText(entry.resolution ?? "")
    setEditingError(null)
    const mediaCaptions: Record<string, string> = {}
    entry.media?.forEach((mediaItem) => {
      mediaCaptions[mediaItem.id] = mediaItem.caption?.trim() || ""
    })
    setEditingMediaCaptions(mediaCaptions)

    // Initialize editingConditionsByTask when remark is location-level (no specific task)
    if (!entry.task) {
      // Resolve location id
      const locationId = (entry as any)?.location?.id || entry.task?.location?.id || (entry as any)?.locationId
      const tasksAtLocation = locationOptions.find((l) => l.id === locationId)?.tasks
        ?? (locationId === 'unassigned' ? localTasks.filter((t) => !t.location?.id) : [])
      const init: Record<string, string> = {}
      ;(tasksAtLocation || []).forEach((t: any) => { if (t?.id) init[t.id] = t.condition || '' })
      setEditingConditionsByTask(init)
      setEditingTasksForLocation((tasksAtLocation || []) as Task[])
    } else {
      setEditingConditionsByTask({})
      setEditingTasksForLocation([])
    }
  }

  const handleUpdateRemark: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!editingEntryId) return

    const trimmedRemark = editingRemarkText.trim()
    const trimmedCause = editingCauseText.trim()
    const trimmedResolution = editingResolutionText.trim()
    const normalizedCondition = editingCondition.trim().toUpperCase()

    if (!normalizedCondition) {
      setEditingError('Please select a status for this remark.')
      return
    }

    const requiresRemark = normalizedCondition !== 'GOOD'
      && normalizedCondition !== 'NOT_APPLICABLE'
      && normalizedCondition !== 'UN_OBSERVABLE'

    if (requiresRemark && trimmedRemark.length === 0) {
      setEditingError('Remarks are required for this status.')
      return
    }

    const mediaUpdates: Array<{ id: string; caption: string | null }> = []
    const currentEntry = localEntries.find((entry) => entry.id === editingEntryId)
    if (currentEntry?.media) {
      currentEntry.media.forEach((mediaItem) => {
        const existingCaption = mediaItem.caption?.trim() || ""
        const nextRaw = editingMediaCaptions[mediaItem.id] ?? existingCaption
        const nextCaption = nextRaw.trim()
        const normalizedNext = nextCaption.length > 0 ? nextCaption : null
        if (normalizedNext !== (mediaItem.caption ?? null)) {
          mediaUpdates.push({ id: mediaItem.id, caption: normalizedNext })
        }
      })
    }

    setEditingSubmitting(true)
    setEditingError(null)
    try {
      const response = await fetch(`/api/checklist-items/remarks/${editingEntryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remark: trimmedRemark,
          cause: trimmedCause,
          resolution: trimmedResolution,
          condition: normalizedCondition,
          mediaUpdates,
          // Bulk conditions for location-level remarks when provided
          conditionsByTask: Object.entries(editingConditionsByTask)
            .filter(([, c]) => (c || '').trim().length > 0)
            .map(([taskId, condition]) => ({ taskId, condition })),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update remark')
      }

      const updated: Entry = await response.json()

      setLocalEntries((prev) =>
        prev.map((entry) => {
          if (entry.id !== updated.id) return entry
          return {
            ...entry,
            remarks: typeof updated.remarks === 'string' ? updated.remarks : null,
            cause: typeof updated.cause === 'string' ? updated.cause : null,
            resolution: typeof updated.resolution === 'string' ? updated.resolution : null,
            condition: typeof updated.condition === 'string' ? updated.condition : updated.condition ?? null,
            includeInReport: typeof updated.includeInReport === 'boolean' ? updated.includeInReport : entry.includeInReport,
            inspector: updated.inspector ?? entry.inspector,
            user: updated.user ?? entry.user,
            task: updated.task ? { ...entry.task, ...updated.task } : entry.task,
            media: Array.isArray(updated.media) ? updated.media : entry.media,
          }
        })
      )

      // Update in-memory subtask conditions after bulk edit
      if (Object.keys(editingConditionsByTask).length > 0) {
        setLocalTasks((prev) => prev.map((task) => ({ ...task, condition: editingConditionsByTask[task.id] ?? task.condition })))
      }

      if (updated.task) {
        const updatedTask = updated.task
        setLocalTasks((prev) =>
          prev.map((task) =>
            task.id === updatedTask.id
              ? { ...task, condition: updatedTask.condition ?? null }
              : task
          )
        )
      }

      router.refresh()
      cancelEditing()
    } catch (error) {
      setEditingError((error as Error).message)
    } finally {
      setEditingSubmitting(false)
    }
  }

  const handleMediaSelection: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const newPhotos: PendingMediaFile[] = []
    const newVideos: PendingMediaFile[] = []
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        newPhotos.push({ file, caption: "" })
        return
      }
      if (file.type.startsWith("video/")) {
        newVideos.push({ file, caption: "" })
      }
    })

    if (newPhotos.length > 0) {
      setPhotoFiles((prev) => [...prev, ...newPhotos])
    }
    if (newVideos.length > 0) {
      setVideoFiles((prev) => [...prev, ...newVideos])
    }

    event.target.value = ""
  }

  const handleClearMedia = () => {
    setPhotoFiles([])
    setVideoFiles([])
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  const updatePhotoCaption = (index: number, caption: string) => {
    setPhotoFiles((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, caption } : entry))
    )
  }

  const updateVideoCaption = (index: number, caption: string) => {
    setVideoFiles((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, caption } : entry))
    )
  }

  const removePhotoAt = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const removeVideoAt = (index: number) => {
    setVideoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveRemark: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!selectedLocationId) {
      setFormError("Please choose a location.")
      return
    }

    const trimmedRemark = remarkText.trim()
    const trimmedCause = causeText.trim()
    const trimmedResolution = resolutionText.trim()

    const selectedConditions = Object.values(conditionsByTask)
    if (selectedConditions.length === 0) {
      setFormError('No subtasks found for this location.')
      return
    }
    const requiresRemark = selectedConditions.some((c) => c && c !== 'GOOD' && c !== 'NOT_APPLICABLE' && c !== 'UN_OBSERVABLE')
    const requiresPhoto = selectedConditions.some((c) => c && c !== 'NOT_APPLICABLE' && c !== 'UN_OBSERVABLE')
    const hasPhotos = photoFiles.length > 0

    if (!trimmedRemark && (requiresRemark || hasPhotos)) {
      setFormError('Remarks are required for this status and whenever photos are attached.')
      return
    }

    if (requiresPhoto && !hasPhotos) {
      setFormError('Please attach at least one photo for this status.')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const formData = new FormData()
      formData.set("locationId", selectedLocationId)
      formData.set("workOrderId", workOrderId)
      const condArray = Object.entries(conditionsByTask).map(([taskId, condition]) => ({ taskId, condition }))
      formData.set('conditionsByTask', JSON.stringify(condArray))
      if (trimmedRemark.length > 0) {
        formData.set("remark", trimmedRemark)
      }
      if (trimmedCause.length > 0) {
        formData.set('cause', trimmedCause)
      }
      if (trimmedResolution.length > 0) {
        formData.set('resolution', trimmedResolution)
      }
      photoFiles.forEach(({ file, caption }) => {
        formData.append('photos', file)
        formData.append('photoCaptions', caption || '')
      })
      videoFiles.forEach(({ file, caption }) => {
        formData.append('videos', file)
        formData.append('videoCaptions', caption || '')
      })

      const response = await fetch(`/api/checklist-items/${itemId}/remarks`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save remark")
      }

      const created: Entry = await response.json()

      setLocalEntries((prev) => [...prev, created])
      // Update all tasks under this location with new conditions
      setLocalTasks((prev) => prev.map((task) => ({ ...task, condition: conditionsByTask[task.id] ?? task.condition })))
      router.refresh()
      resetForm()
    } catch (error) {
      setFormError((error as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleInclude = async (entryId: string, value: boolean) => {
    setLocalEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, includeInReport: value } : entry)))
    try {
      await fetch(`/api/checklist-items/contributions/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInReport: value }),
      })
    } catch (error) {
      // no-op: optimistic update already applied
    }
  }

  const handleDeleteEntry = async (entryId: string) => {
    const proceed = typeof window !== 'undefined' ? window.confirm('Delete this remark? This cannot be undone.') : true
    if (!proceed) return

    setDeletingEntryId(entryId)
    try {
      await fetch(`/api/checklist-items/remarks/${entryId}`, { method: 'DELETE' })
      if (editingEntryId === entryId) {
        cancelEditing()
      }
      setLocalEntries((prev) => prev.filter((entry) => entry.id !== entryId))
      setLocalTasks((prev) =>
        prev.map((task) => {
          if (!Array.isArray(task.entries) || task.entries.length === 0) return task
          if (!task.entries.some((linked) => linked.id === entryId)) return task

          const filteredEntries = task.entries.filter((linked) => linked.id !== entryId)

          return {
            ...task,
            entries: filteredEntries,
          }
        })
      )
      router.refresh()
    } catch (error) {
      console.error('Failed to delete entry', error)
    } finally {
      setDeletingEntryId(null)
    }
  }

  const displayEntries: DisplayEntry[] = useMemo(() => {
    return localEntries.map((entry) => {
      const task = localTasks.find((task) => (task.entries || []).some((linked) => linked.id === entry.id))
      return {
        ...entry,
        task,
        photos: mergeMediaLists([
          extractEntryMedia(entry, 'PHOTO'),
          stringsToAttachments(task?.photos)
        ]),
        videos: mergeMediaLists([
          extractEntryMedia(entry, 'VIDEO'),
          stringsToAttachments(task?.videos)
        ]),
      } as any
    })
  }, [localEntries, localTasks])


  const remarkCount = displayEntries.length
  const hasEntries = remarkCount > 0
  const triggerText = typeof triggerLabel === 'function'
    ? triggerLabel(remarkCount)
    : triggerLabel ?? `Remarks (${remarkCount})`

  const handleDialogToggle = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
      cancelEditing()
    }
  }

  console.log(displayEntries)

  return (
    <Dialog open={open} onOpenChange={handleDialogToggle}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative z-10">
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[72vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{itemName ? `${itemName} — Remarks` : "Item Remarks"}</DialogTitle>
          <DialogDescription>
            Capture notes for subtasks, toggle their reporting status, and manage supporting media.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Capture notes for any checklist subtask and attach supporting photos or videos in one step.</p>
              <p className="text-xs">You can add multiple remarks to the same subtask if needed.</p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                cancelEditing()
                setFormError(null)
                setSelectedLocationId("")
                setRemarkText("")
                setPhotoFiles([])
                setVideoFiles([])
                if (mediaInputRef.current) mediaInputRef.current.value = ""
                setAddingRemark(true)
              }}
              disabled={!hasSelectableTasks || submitting || Boolean(editingEntryId) || editingSubmitting}
              title={
                !hasSelectableTasks
                  ? "No subtasks available for remarks"
                  : "Add a new remark"
              }
            >
              Add Remark
            </Button>
          </div>

          {addingRemark ? (
            <AddRemarkForm
              itemId={itemId}
              workOrderId={workOrderId}
              locationOptions={locationOptions}
              selectedLocationId={selectedLocationId}
              setSelectedLocationId={(id) => setSelectedLocationId(id)}
              availableTasks={availableTasks}
              conditionsByTask={conditionsByTask}
              setConditionsByTask={(next) => setConditionsByTask(next)}
              remarkText={remarkText}
              setRemarkText={(v) => setRemarkText(v)}
              causeText={causeText}
              setCauseText={(v) => setCauseText(v)}
              resolutionText={resolutionText}
              setResolutionText={(v) => setResolutionText(v)}
              submitting={submitting}
              formError={formError}
              onSubmit={handleSaveRemark}
              onCancel={resetForm}
              photoFiles={photoFiles}
              videoFiles={videoFiles}
              updatePhotoCaption={updatePhotoCaption}
              updateVideoCaption={updateVideoCaption}
              removePhotoAt={removePhotoAt}
              removeVideoAt={removeVideoAt}
              onMediaSelection={handleMediaSelection}
              onClearMedia={handleClearMedia}
              mediaInputRef={mediaInputRef}
            />
          ) : null}

          {hasEntries ? (
            <div className="space-y-3">
              {displayEntries.map((entry) => {
                const isEditing = editingEntryId === entry.id
                return (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    itemId={itemId}
                    workOrderId={workOrderId}
                    itemName={itemName}
                    locationOptions={locationOptions}
                    isEditing={isEditing}
                    submitting={submitting}
                    editingSubmitting={editingSubmitting}
                    deletingEntryId={deletingEntryId}
                    onBeginEdit={beginEditingEntry}
                    onCancelEdit={cancelEditing}
                    onDelete={handleDeleteEntry}
                    onToggleInclude={toggleInclude}
                    editingCondition={editingCondition}
                    setEditingCondition={setEditingCondition}
                    editingRemarkText={editingRemarkText}
                    setEditingRemarkText={setEditingRemarkText}
                    editingCauseText={editingCauseText}
                    setEditingCauseText={setEditingCauseText}
                    editingResolutionText={editingResolutionText}
                    setEditingResolutionText={setEditingResolutionText}
                    editingMediaCaptions={editingMediaCaptions}
                    setEditingMediaCaptions={setEditingMediaCaptions}
                    editingError={editingError}
                    onSubmitEdit={handleUpdateRemark}
                    editingTasksForLocation={editingTasksForLocation}
                    editingConditionsByTask={editingConditionsByTask}
                    setEditingConditionsByTask={setEditingConditionsByTask}
                  />
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No remarks yet. Use the Add Remark button above to get started.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
