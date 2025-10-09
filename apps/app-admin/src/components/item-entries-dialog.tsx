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
import { Label } from "@/components/ui/label"
import WorkOrderItemMedia, { MediaAttachment as WorkOrderMediaAttachment } from "@/components/work-order-item-media"
import { extractEntryMedia, mergeMediaLists, stringsToAttachments } from "@/lib/media-utils"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, Upload, X } from "lucide-react"

const CONDITION_OPTIONS = [
  { value: "", label: "Select condition" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "UNSATISFACTORY", label: "Un-Satisfactory" },
  { value: "UN_OBSERVABLE", label: "Un-Observable" },
  { value: "NOT_APPLICABLE", label: "Not Applicable" }
]

type Task = {
  id: string
  name?: string | null
  status?: string | null
  condition?: string | null
  photos?: string[] | null
  videos?: string[] | null
  entries?: { id: string }[] | null
  location?: { id: string; name?: string | null } | null
}

type Entry = {
  id: string
  remarks?: string | null
  cause?: string | null
  resolution?: string | null
  includeInReport?: boolean | null
  inspector?: { id: string; name: string } | null
  user?: { id: string; username?: string | null; email?: string | null } | null
  condition?: string | null
  task?: Task | null
  photos?: string[] | null
  videos?: string[] | null
  media?: EntryMedia[] | null
}

type EntryMedia = {
  id: string
  url: string
  caption?: string | null
  type: 'PHOTO' | 'VIDEO'
  order?: number | null
}

type DisplayEntry = Entry & {
  task: Task | undefined
  photos: WorkOrderMediaAttachment[]
  videos: WorkOrderMediaAttachment[]
}

type PendingMediaFile = {
  file: File
  caption: string
}

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

function formatCondition(value?: string | null) {
  if (!value) return null
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildMediaLabel(itemName?: string, context?: string | null) {
  if (!itemName) return context || "Checklist item remark"
  if (!context) return itemName
  return `${itemName} — ${context}`
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
  const [selectedTaskId, setSelectedTaskId] = useState<string>("")
  const [selectedCondition, setSelectedCondition] = useState<string>("")
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
      setSelectedTaskId("")
    }
  }, [addingRemark, locationOptions, selectedLocationId])

  useEffect(() => {
    if (!addingRemark) return

    if (!selectedLocationId) {
      setSelectedTaskId("")
      return
    }

    if (availableTasks.length === 0) {
      setSelectedTaskId("")
      return
    }

    setSelectedTaskId((prev) =>
      prev && availableTasks.some((task) => task.id === prev)
        ? prev
        : availableTasks[0]?.id || ""
    )

    setSelectedCondition('GOOD')
  }, [addingRemark, selectedLocationId, availableTasks])

  const resetForm = () => {
    setAddingRemark(false)
    setSelectedLocationId("")
    setSelectedTaskId("")
    setSelectedCondition("")
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
      setFormError("Please choose a location before selecting a subtask.")
      return
    }

    if (!selectedTaskId) {
      setFormError("Please choose a subtask to attach this remark to.")
      return
    }

    const trimmedRemark = remarkText.trim()
    const trimmedCause = causeText.trim()
    const trimmedResolution = resolutionText.trim()
    const normalizedCondition = selectedCondition.trim().toUpperCase()

    if (!normalizedCondition) {
      setFormError('Please select a status for this remark.')
      return
    }
    const requiresRemark = normalizedCondition && normalizedCondition !== 'GOOD'
    const requiresPhoto = normalizedCondition && normalizedCondition !== 'NOT_APPLICABLE' && normalizedCondition !== 'UN_OBSERVABLE'
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
      formData.set("taskId", selectedTaskId)
      formData.set("locationId", selectedLocationId)
      formData.set("workOrderId", workOrderId)
      if (selectedCondition) {
        formData.set("condition", selectedCondition)
      }
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
      setLocalTasks((prev) =>
        prev.map((task) =>
          task.id === selectedTaskId
            ? {
                ...task,
                condition: created.task?.condition ?? task.condition,
                entries: Array.isArray(task.entries)
                  ? [...task.entries, { id: created.id }]
                  : [{ id: created.id }],
              }
            : task
        )
      )
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
      }
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
                setSelectedTaskId("")
                setSelectedCondition('GOOD')
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
            <form onSubmit={handleSaveRemark} className="space-y-4 rounded-md border bg-background p-4 shadow-sm">
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`select-location-${itemId}`}>Location</Label>
                  <select
                    id={`select-location-${itemId}`}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                    value={selectedLocationId}
                    onChange={(event) => setSelectedLocationId(event.target.value)}
                    disabled={submitting || locationOptions.length === 0}
                  >
                    <option value="">Select location</option>
                    {locationOptions.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`select-subtask-${itemId}`}>Subtask</Label>
                  <select
                    id={`select-subtask-${itemId}`}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    disabled={submitting || !selectedLocationId || availableTasks.length === 0}
                  >
                    <option value="">Select subtask</option>
                    {availableTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name || "Untitled subtask"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`select-condition-${itemId}`}>Condition</Label>
                  <select
                    id={`select-condition-${itemId}`}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                    value={selectedCondition}
                    onChange={(event) => setSelectedCondition(event.target.value)}
                    disabled={submitting}
                  >
                    {CONDITION_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`remark-text-${itemId}`}>Remarks</Label>
                <textarea
                  id={`remark-text-${itemId}`}
                  className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                  value={remarkText}
                  onChange={(event) => setRemarkText(event.target.value)}
                  placeholder="Add context for this subtask"
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`cause-text-${itemId}`}>Cause</Label>
                  <textarea
                    id={`cause-text-${itemId}`}
                    className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                    value={causeText}
                    onChange={(event) => setCauseText(event.target.value)}
                    placeholder="Describe the suspected cause (optional)"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`resolution-text-${itemId}`}>Resolution</Label>
                  <textarea
                    id={`resolution-text-${itemId}`}
                    className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                    value={resolutionText}
                    onChange={(event) => setResolutionText(event.target.value)}
                    placeholder="Outline the recommended resolution (optional)"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Attachments</Label>
                  <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        {photoFiles.length} photo(s) • {videoFiles.length} video(s)
                      </p>
                      <div className="flex items-center gap-2">
                        {(photoFiles.length > 0 || videoFiles.length > 0) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClearMedia}
                            disabled={submitting}
                            className="h-8 px-2 text-xs"
                          >
                            <X className="mr-1 h-3 w-3" />Clear all
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => mediaInputRef.current?.click()}
                          disabled={submitting}
                          title="Add photos or videos"
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {(photoFiles.length > 0 || videoFiles.length > 0) && (
                      <div className="mt-3 space-y-3 text-sm">
                        {photoFiles.map((entry, index) => (
                          <div
                            key={`photo-${index}-${entry.file.name}`}
                            className="rounded border border-transparent bg-background px-2 py-2 text-muted-foreground"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate">Photo: {entry.file.name || `photo-${index + 1}`}</span>
                              <button
                                type="button"
                                onClick={() => removePhotoAt(index)}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                disabled={submitting}
                                aria-label={`Remove ${entry.file.name || 'photo'}`}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="sr-only">Remove file</span>
                              </button>
                            </div>
                            <label className="mt-2 block text-xs text-muted-foreground" htmlFor={`photo-caption-${itemId}-${index}`}>
                              Caption (optional)
                            </label>
                            <input
                              id={`photo-caption-${itemId}-${index}`}
                              type="text"
                              className="mt-1 w-full rounded border px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-0 focus:border-gray-300"
                              value={entry.caption}
                              onChange={(event) => updatePhotoCaption(index, event.target.value)}
                              placeholder="Describe this photo"
                              disabled={submitting}
                            />
                          </div>
                        ))}
                        {videoFiles.map((entry, index) => (
                          <div
                            key={`video-${index}-${entry.file.name}`}
                            className="rounded border border-transparent bg-background px-2 py-2 text-muted-foreground"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate">Video: {entry.file.name || `video-${index + 1}`}</span>
                              <button
                                type="button"
                                onClick={() => removeVideoAt(index)}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                disabled={submitting}
                                aria-label={`Remove ${entry.file.name || 'video'}`}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="sr-only">Remove file</span>
                              </button>
                            </div>
                            <label className="mt-2 block text-xs text-muted-foreground" htmlFor={`video-caption-${itemId}-${index}`}>
                              Caption (optional)
                            </label>
                            <input
                              id={`video-caption-${itemId}-${index}`}
                              type="text"
                              className="mt-1 w-full rounded border px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-0 focus:border-gray-300"
                              value={entry.caption}
                              onChange={(event) => updateVideoCaption(index, event.target.value)}
                              placeholder="Describe this video"
                              disabled={submitting}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Files upload to storage after you save this remark.
                  </p>
                </div>
                <input
                  ref={mediaInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleMediaSelection}
                  disabled={submitting}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !selectedLocationId || !selectedTaskId}>
                  {submitting ? "Saving..." : "Save Remark"}
                </Button>
              </div>
            </form>
          ) : null}

          {hasEntries ? (
            <div className="space-y-3">
              {displayEntries.map((entry) => {
                const task = entry.task
                const rawLocationName = task?.location?.name
                const fallbackLocationName = !rawLocationName && task ? (itemName ? `${itemName} — General` : 'General') : null
                const locationName = rawLocationName || fallbackLocationName
                const conditionLabel = formatCondition(entry.condition ?? task?.condition)
                const createdBy = entry.inspector?.name || entry.user?.username || entry.user?.email || null
                const headlineBase = task?.name || createdBy || 'Remark'
                const headline = locationName ? `${locationName} — ${headlineBase}` : headlineBase
                const mediaContext = task?.name || locationName || createdBy || null
                const mediaLabel = buildMediaLabel(itemName, mediaContext)
                const showByline = Boolean(createdBy) && headline !== createdBy
                const isEditing = editingEntryId === entry.id
                const cardClasses = `rounded-md border p-3 ${isEditing ? 'border-primary/60 bg-primary/5' : ''}`

                return (
                  <div key={entry.id} className={cardClasses}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{headline}</p>
                        {showByline ? (
                          <p className="text-xs text-muted-foreground mt-0.5">By {createdBy}</p>
                        ) : null}
                        {locationName ? (
                          <p className="text-xs text-muted-foreground mt-0.5">Location: {locationName}</p>
                        ) : null}
                        {conditionLabel ? (
                          <p className="text-xs text-muted-foreground mt-0.5">Condition: {conditionLabel}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2 sm:self-start">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              if (isEditing) {
                                cancelEditing()
                              } else {
                                beginEditingEntry(entry)
                              }
                            }}
                            disabled={submitting || editingSubmitting || deletingEntryId === entry.id}
                            title={isEditing ? 'Cancel edit' : 'Edit remark'}
                          >
                            <Pencil className={`h-4 w-4 ${isEditing ? 'text-primary' : ''}`} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDeleteEntry(entry.id)}
                            disabled={deletingEntryId === entry.id || editingSubmitting}
                            title="Delete remark"
                          >
                            <Trash2 className={`h-4 w-4 ${deletingEntryId === entry.id ? 'animate-pulse text-destructive' : ''}`} />
                          </Button>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(entry.includeInReport)}
                            onChange={(event) => toggleInclude(entry.id, event.target.checked)}
                            disabled={editingSubmitting}
                          />
                          Use in final report
                        </label>
                      </div>
                    </div>
                    {isEditing ? (
                      <form onSubmit={handleUpdateRemark} className="mt-3 space-y-3 rounded-md border bg-background p-3 shadow-sm">
                        {editingError && (
                          <p className="text-sm text-destructive">{editingError}</p>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`edit-condition-${entry.id}`}>Condition</Label>
                            <select
                              id={`edit-condition-${entry.id}`}
                              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                              value={editingCondition}
                              onChange={(event) => setEditingCondition(event.target.value)}
                              disabled={editingSubmitting}
                            >
                              {CONDITION_OPTIONS.map((option) => (
                                <option key={option.value || 'empty'} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`edit-remark-${entry.id}`}>Remarks</Label>
                            <textarea
                              id={`edit-remark-${entry.id}`}
                              className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                              value={editingRemarkText}
                              onChange={(event) => setEditingRemarkText(event.target.value)}
                              disabled={editingSubmitting}
                              placeholder="Update the note for this subtask"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`edit-cause-${entry.id}`}>Cause</Label>
                            <textarea
                              id={`edit-cause-${entry.id}`}
                              className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                              value={editingCauseText}
                              onChange={(event) => setEditingCauseText(event.target.value)}
                              disabled={editingSubmitting}
                              placeholder="Describe the suspected cause (optional)"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`edit-resolution-${entry.id}`}>Resolution</Label>
                            <textarea
                              id={`edit-resolution-${entry.id}`}
                              className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                              value={editingResolutionText}
                              onChange={(event) => setEditingResolutionText(event.target.value)}
                              disabled={editingSubmitting}
                              placeholder="Outline the recommended resolution (optional)"
                            />
                          </div>
                        </div>
                        {(entry.media && entry.media.length > 0) ? (
                          <div className="space-y-3">
                            <Label>Edit Media Captions</Label>
                            <div className="space-y-4">
                              {(entry.media || []).map((mediaItem) => {
                                const isPhoto = mediaItem.type === 'PHOTO'
                                const captionValue = editingMediaCaptions[mediaItem.id] ?? mediaItem.caption ?? ''
                                return (
                                  <div key={mediaItem.id} className="rounded-md border border-dashed border-muted-foreground/30 p-3">
                                    <div className="flex items-start gap-3">
                                      {isPhoto ? (
                                        <img
                                          src={mediaItem.url}
                                          alt={captionValue ? `${captionValue} preview` : 'Photo preview'}
                                          className="h-20 w-20 rounded object-cover border"
                                        />
                                      ) : (
                                        <video src={mediaItem.url} className="h-20 w-32 rounded border" controls={false} muted />
                                      )}
                                      <div className="flex-1 space-y-2">
                                        
                                        <input
                                          type="text"
                                          className="mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                                          value={captionValue}
                                          onChange={(event) =>
                                            setEditingMediaCaptions((prev) => ({
                                              ...prev,
                                              [mediaItem.id]: event.target.value,
                                            }))
                                          }
                                          placeholder="Add a caption"
                                          disabled={editingSubmitting}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={cancelEditing} disabled={editingSubmitting}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={editingSubmitting}>
                            {editingSubmitting ? 'Saving...' : 'Update Remark'}
                          </Button>
                        </div>
                      </form>
                    ) : entry.remarks ? (
                      <p className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">Remarks:</span> {entry.remarks}
                      </p>
                    ) : null}
                    {!isEditing && entry.cause ? (
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">Cause:</span> {entry.cause}
                      </p>
                    ) : null}
                    {!isEditing && entry.resolution ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium text-foreground">Resolution:</span> {entry.resolution}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <WorkOrderItemMedia
                        itemId={itemId}
                        workOrderId={workOrderId}
                        photos={entry.photos}
                        videos={entry.videos}
                        itemName={mediaLabel}
                        contributionId={entry.id}
                      />
                    </div>
                  </div>
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
