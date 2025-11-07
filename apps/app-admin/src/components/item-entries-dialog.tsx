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
import { extractEntryMedia, mergeMediaLists, stringsToAttachments, stringsToAttachmentsWithTask } from "@/lib/media-utils"
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
  // Optional: checklist item number used for index labeling (e.g., 6.4.1)
  itemNumber?: number
}

export default function ItemEntriesDialog({
  itemId,
  workOrderId,
  entries = [],
  tasks = [],
  locations = [],
  itemName,
  triggerLabel,
  itemNumber,
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
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [photoFiles, setPhotoFiles] = useState<PendingMediaFile[]>([])
  const [videoFiles, setVideoFiles] = useState<PendingMediaFile[]>([])
  // Per-task media and details
  const [taskPhotoFiles, setTaskPhotoFiles] = useState<Record<string, PendingMediaFile[]>>({})
  const [taskVideoFiles, setTaskVideoFiles] = useState<Record<string, PendingMediaFile[]>>({})
  const [taskCauseById, setTaskCauseById] = useState<Record<string, string>>({})
  const [taskResolutionById, setTaskResolutionById] = useState<Record<string, string>>({})
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingRemarkText, setEditingRemarkText] = useState<string>("")
  const [editingCondition, setEditingCondition] = useState<string>("")
  const [editingConditionsByTask, setEditingConditionsByTask] = useState<Record<string, string>>({})
  const [editingTasksForLocation, setEditingTasksForLocation] = useState<Task[]>([])
  const [editingError, setEditingError] = useState<string | null>(null)
  const [editingSubmitting, setEditingSubmitting] = useState(false)
  const [editingMediaCaptions, setEditingMediaCaptions] = useState<Record<string, string>>({})
  const [editingFindingsByTask, setEditingFindingsByTask] = useState<Record<string, { condition: string; cause?: string; resolution?: string }>>({})
  // Staged edit additions/deletions
  const [editingAddedEntryPhotos, setEditingAddedEntryPhotos] = useState<PendingMediaFile[]>([])
  const [editingAddedEntryVideos, setEditingAddedEntryVideos] = useState<PendingMediaFile[]>([])
  const [editingAddedTaskPhotos, setEditingAddedTaskPhotos] = useState<Record<string, PendingMediaFile[]>>({})
  const [editingAddedTaskVideos, setEditingAddedTaskVideos] = useState<Record<string, PendingMediaFile[]>>({})
  const [editingDeletedMediaIds, setEditingDeletedMediaIds] = useState<string[]>([])

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
    setFormError(null)
    setPhotoFiles([])
    setVideoFiles([])
    setTaskPhotoFiles({})
    setTaskVideoFiles({})
    setTaskCauseById({})
    setTaskResolutionById({})
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  const cancelEditing = () => {
    setEditingEntryId(null)
    setEditingRemarkText("")
    setEditingCondition("")
    setEditingError(null)
    setEditingSubmitting(false)
    setEditingMediaCaptions({})
    setEditingFindingsByTask({})
    setEditingAddedEntryPhotos([])
    setEditingAddedEntryVideos([])
    setEditingAddedTaskPhotos({})
    setEditingAddedTaskVideos({})
    setEditingDeletedMediaIds([])
  }

  const beginEditingEntry = (entry: DisplayEntry) => {
    resetForm()
    setEditingEntryId(entry.id)
    setEditingRemarkText(entry.remarks ?? "")
    const initialCondition = entry.condition ?? entry.task?.condition ?? "GOOD"
    setEditingCondition(initialCondition || "")
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

    // Initialize findings edit map from entry.findings
    const nextFindings: Record<string, { condition: string; cause?: string; resolution?: string }> = {}
    const fList = (entry as any)?.findings as any[] | undefined
    if (Array.isArray(fList)) {
      fList.forEach((f) => {
        const details = (f?.details || {}) as any
        const cnd = typeof details.condition === 'string' ? details.condition : ''
        const cause = typeof details.cause === 'string' ? details.cause : undefined
        const resolution = typeof details.resolution === 'string' ? details.resolution : undefined
        if (f?.taskId) nextFindings[f.taskId] = { condition: cnd, cause, resolution }
      })
    }
    setEditingFindingsByTask(nextFindings)
  }

  // Edit: staged add/delete handlers
  const addEntryMedia = (files: File[]) => {
    const photos: PendingMediaFile[] = []
    const videos: PendingMediaFile[] = []
    files.forEach((f) => {
      if (f.type.startsWith('image/')) photos.push({ file: f, caption: '' })
      else if (f.type.startsWith('video/')) videos.push({ file: f, caption: '' })
    })
    if (photos.length) setEditingAddedEntryPhotos((prev) => [...prev, ...photos])
    if (videos.length) setEditingAddedEntryVideos((prev) => [...prev, ...videos])
  }
  const addFindingMedia = (taskId: string, files: File[]) => {
    const photos: PendingMediaFile[] = []
    const videos: PendingMediaFile[] = []
    files.forEach((f) => {
      if (f.type.startsWith('image/')) photos.push({ file: f, caption: '' })
      else if (f.type.startsWith('video/')) videos.push({ file: f, caption: '' })
    })
    if (photos.length) setEditingAddedTaskPhotos((prev) => ({ ...prev, [taskId]: [ ...(prev[taskId] || []), ...photos ] }))
    if (videos.length) setEditingAddedTaskVideos((prev) => ({ ...prev, [taskId]: [ ...(prev[taskId] || []), ...videos ] }))
  }
  const deleteExistingMedia = (mediaId: string) => {
    setEditingDeletedMediaIds((prev) => (prev.includes(mediaId) ? prev : [...prev, mediaId]))
    // Optimistically hide it in UI
    setLocalEntries((prev) => prev.map((entry) => (
      entry.id !== editingEntryId ? entry : { ...entry, media: (entry.media || []).filter((m: any) => m.id !== mediaId) as any }
    )))
  }

  const handleUpdateRemark: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!editingEntryId) return

    const trimmedRemark = editingRemarkText.trim()
    // Build findings payload from editingFindingsByTask (preferred)
    const findings = Object.entries(editingFindingsByTask)
      .map(([taskId, d]) => ({ taskId, condition: (d.condition || '').trim().toUpperCase(), cause: (d.cause || '').trim() || undefined, resolution: (d.resolution || '').trim() || undefined }))
      .filter((f) => f.taskId && f.condition)

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
      // If we have staged files or deletions, use multipart; otherwise JSON
      const hasAdds = editingAddedEntryPhotos.length + editingAddedEntryVideos.length + Object.values(editingAddedTaskPhotos).reduce((a, b) => a + b.length, 0) + Object.values(editingAddedTaskVideos).reduce((a, b) => a + b.length, 0)
      const hasDeletes = editingDeletedMediaIds.length > 0
      let response: Response
      if (hasAdds || hasDeletes) {
        const form = new FormData()
        form.set('remark', trimmedRemark)
        form.set('findings', JSON.stringify(findings))
        form.set('mediaUpdates', JSON.stringify(mediaUpdates))
        editingDeletedMediaIds.forEach((id) => form.append('deleteMediaIds', id))
        // Entry-level adds
        editingAddedEntryPhotos.forEach(({ file, caption }) => { form.append('photos', file); form.append('photoCaptions', caption || '') })
        editingAddedEntryVideos.forEach(({ file, caption }) => { form.append('videos', file); form.append('videoCaptions', caption || '') })
        // Task-level adds
        Object.entries(editingAddedTaskPhotos).forEach(([taskId, files]) => {
          files.forEach(({ file, caption }) => { form.append('taskPhotos', file); form.append('taskPhotoTaskIds', taskId); form.append('taskPhotoCaptions', caption || '') })
        })
        Object.entries(editingAddedTaskVideos).forEach(([taskId, files]) => {
          files.forEach(({ file, caption }) => { form.append('taskVideos', file); form.append('taskVideoTaskIds', taskId); form.append('taskVideoCaptions', caption || '') })
        })
        response = await fetch(`/api/checklist-items/remarks/${editingEntryId}`, { method: 'PATCH', body: form })
      } else {
        response = await fetch(`/api/checklist-items/remarks/${editingEntryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remark: trimmedRemark, findings, mediaUpdates }),
        })
      }

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
            condition: typeof updated.condition === 'string' ? updated.condition : updated.condition ?? null,
            includeInReport: typeof updated.includeInReport === 'boolean' ? updated.includeInReport : entry.includeInReport,
            inspector: updated.inspector ?? entry.inspector,
            user: updated.user ?? entry.user,
            task: updated.task ? { ...entry.task, ...updated.task } : entry.task,
            media: Array.isArray(updated.media) ? updated.media : entry.media,
          }
        })
      )

      // Update in-memory subtask conditions from findings
      if (findings.length > 0) {
        const mapCond: Record<string, string> = {}
        findings.forEach((f) => { mapCond[f.taskId] = f.condition })
        setLocalTasks((prev) => prev.map((task) => ({ ...task, condition: mapCond[task.id] ?? task.condition })))
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

  // Per-task media handlers
  const onTaskMediaSelection = (taskId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const newPhotos: PendingMediaFile[] = []
    const newVideos: PendingMediaFile[] = []
    files.forEach((file) => {
      if (file.type.startsWith('image/')) newPhotos.push({ file, caption: '' })
      else if (file.type.startsWith('video/')) newVideos.push({ file, caption: '' })
    })
    if (newPhotos.length > 0) setTaskPhotoFiles((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), ...newPhotos] }))
    if (newVideos.length > 0) setTaskVideoFiles((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), ...newVideos] }))
    event.target.value = ''
  }
  const onTaskMediaClear = (taskId: string) => {
    setTaskPhotoFiles((prev) => ({ ...prev, [taskId]: [] }))
    setTaskVideoFiles((prev) => ({ ...prev, [taskId]: [] }))
  }
  const updateTaskPhotoCaption = (taskId: string, index: number, caption: string) => {
    setTaskPhotoFiles((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((e, i) => (i === index ? { ...e, caption } : e))
    }))
  }
  const updateTaskVideoCaption = (taskId: string, index: number, caption: string) => {
    setTaskVideoFiles((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((e, i) => (i === index ? { ...e, caption } : e))
    }))
  }
  const removeTaskPhotoAt = (taskId: string, index: number) => {
    setTaskPhotoFiles((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).filter((_, i) => i !== index)
    }))
  }
  const removeTaskVideoAt = (taskId: string, index: number) => {
    setTaskVideoFiles((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).filter((_, i) => i !== index)
    }))
  }

  const handleSaveRemark: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!selectedLocationId) {
      setFormError("Please choose a location.")
      return
    }

    const trimmedRemark = remarkText.trim()

    const selectedConditions = Object.values(conditionsByTask)
    if (selectedConditions.length === 0) {
      setFormError('No subtasks found for this location.')
      return
    }
    // Ensure every task has a selected condition
    const allHaveCondition = availableTasks.every((t) => (conditionsByTask[t.id] || '').trim().length > 0)
    if (!allHaveCondition) {
      setFormError('Please select a condition for each subtask.')
      return
    }
    const requiresRemark = selectedConditions.some((c) => c && c !== 'GOOD' && c !== 'NOT_APPLICABLE' && c !== 'UN_OBSERVABLE')
    const hasPhotos = photoFiles.length > 0
    if (!trimmedRemark && (requiresRemark || hasPhotos)) {
      setFormError('Remarks are required when status is not GOOD, or when photos are attached.')
      return
    }

    // Enforce per-task media and cause/resolution rules
    for (const task of availableTasks) {
      const cond = (conditionsByTask[task.id] || '').trim().toUpperCase()
      if (!cond) continue
      const tPhotos = taskPhotoFiles[task.id] || []
      const tVideos = taskVideoFiles[task.id] || []
      const total = tPhotos.length + tVideos.length
      if (total === 0) {
        setFormError('Each subtask condition requires at least one media file.')
        return
      }
      if (cond === 'FAIR' || cond === 'UNSATISFACTORY') {
        const c = (taskCauseById[task.id] || '').trim()
        const r = (taskResolutionById[task.id] || '').trim()
        if (!c || !r) {
          setFormError('Cause and resolution are required for FAIR or UNSATISFACTORY conditions.')
          return
        }
      }
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const formData = new FormData()
      formData.set("locationId", selectedLocationId)
      formData.set("workOrderId", workOrderId)
      // Preferred payload: findings with per-task condition/cause/resolution
      const findings = availableTasks.map((t) => ({
        taskId: t.id,
        condition: (conditionsByTask[t.id] || '').trim().toUpperCase(),
        cause: (taskCauseById[t.id] || '').trim() || undefined,
        resolution: (taskResolutionById[t.id] || '').trim() || undefined,
      }))
      formData.set('findings', JSON.stringify(findings))
      if (trimmedRemark.length > 0) {
        formData.set("remark", trimmedRemark)
      }
      photoFiles.forEach(({ file, caption }) => {
        formData.append('photos', file)
        formData.append('photoCaptions', caption || '')
      })
      videoFiles.forEach(({ file, caption }) => {
        formData.append('videos', file)
        formData.append('videoCaptions', caption || '')
      })

      // Per-task media batches, aligned arrays
      for (const task of availableTasks) {
        const tPhotos = taskPhotoFiles[task.id] || []
        const tVideos = taskVideoFiles[task.id] || []
        tPhotos.forEach(({ file, caption }) => {
          formData.append('taskPhotos', file)
          formData.append('taskPhotoTaskIds', task.id)
          formData.append('taskPhotoCaptions', caption || '')
        })
        tVideos.forEach(({ file, caption }) => {
          formData.append('taskVideos', file)
          formData.append('taskVideoTaskIds', task.id)
          formData.append('taskVideoCaptions', caption || '')
        })
      }

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
          stringsToAttachmentsWithTask(task?.photos, task?.id)
        ]),
        videos: mergeMediaLists([
          extractEntryMedia(entry, 'VIDEO'),
          stringsToAttachmentsWithTask(task?.videos, task?.id)
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


  return (
    <Dialog open={open} onOpenChange={handleDialogToggle}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative z-10">
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl w-full max-h-[82vh] overflow-auto">
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
              taskPhotoFiles={taskPhotoFiles}
              taskVideoFiles={taskVideoFiles}
              onTaskMediaSelection={onTaskMediaSelection}
              onTaskMediaClear={onTaskMediaClear}
              updateTaskPhotoCaption={updateTaskPhotoCaption}
              updateTaskVideoCaption={updateTaskVideoCaption}
              removeTaskPhotoAt={removeTaskPhotoAt}
              removeTaskVideoAt={removeTaskVideoAt}
              taskCauseById={taskCauseById}
              setTaskCauseById={(updater) => setTaskCauseById((prev) => updater(prev))}
              taskResolutionById={taskResolutionById}
              setTaskResolutionById={(updater) => setTaskResolutionById((prev) => updater(prev))}
              itemNumber={itemNumber}
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
                    itemNumber={itemNumber}
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
                    editingMediaCaptions={editingMediaCaptions}
                    setEditingMediaCaptions={setEditingMediaCaptions}
                    editingError={editingError}
                    onSubmitEdit={handleUpdateRemark}
                    editingTasksForLocation={editingTasksForLocation}
                    editingConditionsByTask={editingConditionsByTask}
                    setEditingConditionsByTask={setEditingConditionsByTask}
                    editingFindingsByTask={editingFindingsByTask}
                    setEditingFindingsByTask={(updater) => setEditingFindingsByTask((prev) => updater(prev))}
                    onAddEntryMedia={addEntryMedia}
                    onAddFindingMedia={addFindingMedia}
                    onDeleteMedia={deleteExistingMedia}
                    editingAddedEntryPhotos={editingAddedEntryPhotos}
                    editingAddedEntryVideos={editingAddedEntryVideos}
                    setEditingAddedEntryPhotos={(updater) => setEditingAddedEntryPhotos((prev) => updater(prev))}
                    setEditingAddedEntryVideos={(updater) => setEditingAddedEntryVideos((prev) => updater(prev))}
                    editingAddedTaskPhotos={editingAddedTaskPhotos}
                    editingAddedTaskVideos={editingAddedTaskVideos}
                    setEditingAddedTaskPhotos={(updater) => setEditingAddedTaskPhotos((prev) => updater(prev))}
                    setEditingAddedTaskVideos={(updater) => setEditingAddedTaskVideos((prev) => updater(prev))}
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
