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
import WorkOrderItemMedia from "@/components/work-order-item-media"
import { useRouter } from "next/navigation"
import { Trash2, Upload, X } from "lucide-react"

const CONDITION_OPTIONS = [
  { value: "", label: "Select condition" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "UNSATISFACTORY", label: "Un-Satisfactory" },
  { value: "NOT_APPLICABLE", label: "Not Applicable" },
  { value: "UNOBSERVABLE", label: "Unobservable" }
]

type Task = {
  id: string
  name?: string | null
  status?: string | null
  condition?: string | null
  photos?: string[] | null
  videos?: string[] | null
  entries?: { id: string }[] | null
}

type Entry = {
  id: string
  remarks?: string | null
  includeInReport?: boolean | null
  inspector?: { id: string; name: string } | null
  user?: { id: string; username?: string | null; email?: string | null } | null
  condition?: string | null
  task?: Task | null
  photos?: string[] | null
  videos?: string[] | null
}

type DisplayEntry = Entry & {
  task: Task | undefined
  photos: string[]
  videos: string[]
}

type Props = {
  itemId: string
  workOrderId: string
  entries?: Entry[]
  tasks?: Task[]
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
  itemName,
  triggerLabel,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [localEntries, setLocalEntries] = useState<Entry[]>(entries)
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)
  const [addingRemark, setAddingRemark] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string>("")
  const [selectedCondition, setSelectedCondition] = useState<string>("")
  const [remarkText, setRemarkText] = useState<string>("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [videoFiles, setVideoFiles] = useState<File[]>([])

  useEffect(() => {
    setLocalEntries(entries)
  }, [entries])

  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const availableTasks = useMemo(() => localTasks, [localTasks])

  useEffect(() => {
    if (!addingRemark) return
    if (availableTasks.length === 0) {
      setSelectedTaskId("")
      return
    }
    setSelectedTaskId((prev) =>
      prev && availableTasks.some((task) => task.id === prev)
        ? prev
        : availableTasks[0]?.id || ""
    )
    setSelectedCondition((prev) => (prev ? prev : 'GOOD'))
  }, [addingRemark, availableTasks])

  const resetForm = () => {
    setAddingRemark(false)
    setSelectedTaskId("")
    setSelectedCondition("")
    setRemarkText("")
    setFormError(null)
    setPhotoFiles([])
    setVideoFiles([])
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  const handleMediaSelection: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const newPhotos: File[] = []
    const newVideos: File[] = []
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        newPhotos.push(file)
        return
      }
      if (file.type.startsWith("video/")) {
        newVideos.push(file)
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

  const removePhotoAt = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const removeVideoAt = (index: number) => {
    setVideoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveRemark: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!selectedTaskId) {
      setFormError("Please choose a subtask to attach this remark to.")
      return
    }

    const trimmedRemark = remarkText.trim()
    const normalizedCondition = selectedCondition.trim().toUpperCase()

    if (!normalizedCondition) {
      setFormError('Please select a status for this remark.')
      return
    }
    const requiresRemark = normalizedCondition && normalizedCondition !== 'GOOD'
    const requiresPhoto = normalizedCondition && normalizedCondition !== 'NOT_APPLICABLE' && normalizedCondition !== 'UNOBSERVABLE'
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
      formData.set("workOrderId", workOrderId)
      if (selectedCondition) {
        formData.set("condition", selectedCondition)
      }
      if (trimmedRemark.length > 0) {
        formData.set("remark", trimmedRemark)
      }
      photoFiles.forEach((file) => formData.append("photos", file))
      videoFiles.forEach((file) => formData.append("videos", file))

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
      const entryPhotos: string[] = Array.isArray(entry.photos) ? entry.photos : []
      const taskPhotos: string[] = task && Array.isArray(task.photos) ? task.photos : []
      const entryVideos: string[] = Array.isArray(entry.videos) ? entry.videos : []
      const taskVideos: string[] = task && Array.isArray(task.videos) ? task.videos : []

      return {
        ...entry,
        task,
        photos: Array.from(new Set([...entryPhotos, ...taskPhotos])),
        videos: Array.from(new Set([...entryVideos, ...taskVideos])),
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
                setFormError(null)
                setAddingRemark(true)
              }}
              disabled={availableTasks.length === 0 || submitting}
              title={
                availableTasks.length === 0
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
                  <Label htmlFor={`select-subtask-${itemId}`}>Subtask</Label>
                  <select
                    id={`select-subtask-${itemId}`}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    disabled={submitting || availableTasks.length === 0}
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
                      <div className="mt-3 space-y-2 text-sm">
                        {photoFiles.map((file, index) => (
                          <div
                            key={`photo-${index}-${file.name}`}
                            className="flex items-center justify-between gap-3 rounded border border-transparent bg-background px-2 py-1 text-muted-foreground"
                          >
                            <span className="truncate">Photo: {file.name || `photo-${index + 1}`}</span>
                            <button
                              type="button"
                              onClick={() => removePhotoAt(index)}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              disabled={submitting}
                              aria-label={`Remove ${file.name || 'photo'}`}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Remove file</span>
                            </button>
                          </div>
                        ))}
                        {videoFiles.map((file, index) => (
                          <div
                            key={`video-${index}-${file.name}`}
                            className="flex items-center justify-between gap-3 rounded border border-transparent bg-background px-2 py-1 text-muted-foreground"
                          >
                            <span className="truncate">Video: {file.name || `video-${index + 1}`}</span>
                            <button
                              type="button"
                              onClick={() => removeVideoAt(index)}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              disabled={submitting}
                              aria-label={`Remove ${file.name || 'video'}`}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Remove file</span>
                            </button>
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
                <Button type="submit" disabled={submitting || !selectedTaskId}>
                  {submitting ? "Saving..." : "Save Remark"}
                </Button>
              </div>
            </form>
          ) : null}

          {hasEntries ? (
            <div className="space-y-3">
              {displayEntries.map((entry) => {
                const task = entry.task
                const conditionLabel = formatCondition(entry.condition ?? task?.condition)
                const createdBy = entry.inspector?.name || entry.user?.username || entry.user?.email || null
                const headline = task?.name || createdBy || 'Remark'
                const mediaContext = task?.name || createdBy || null
                const mediaLabel = buildMediaLabel(itemName, mediaContext)
                const showByline = Boolean(createdBy) && headline !== createdBy

                return (
                  <div key={entry.id} className="rounded-md border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{headline}</p>
                        {showByline ? (
                          <p className="text-xs text-muted-foreground mt-0.5">By {createdBy}</p>
                        ) : null}
                        {conditionLabel ? (
                          <p className="text-xs text-muted-foreground mt-0.5">Condition: {conditionLabel}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 sm:self-start">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(entry.includeInReport)}
                            onChange={(event) => toggleInclude(entry.id, event.target.checked)}
                          />
                          Use in final report
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteEntry(entry.id)}
                          disabled={deletingEntryId === entry.id}
                          title="Delete remark"
                        >
                          <Trash2 className={`h-4 w-4 ${deletingEntryId === entry.id ? 'animate-pulse text-destructive' : ''}`} />
                        </Button>
                      </div>
                    </div>
                    {entry.remarks ? (
                      <p className="text-sm text-muted-foreground mt-2">
                        {entry.remarks}
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
