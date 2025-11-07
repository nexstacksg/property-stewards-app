"use client"

import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import EditRemarkForm from "./edit-remark-form"
import { DisplayEntry, Task, PendingMediaFile } from "./types"
import { buildMediaLabel, formatCondition } from "./utils"
import WorkOrderItemMedia from "@/components/work-order-item-media"

type LocationOption = { id: string; name: string; tasks: Task[] }

type Props = {
  entry: DisplayEntry
  itemId: string
  workOrderId: string
  itemName?: string
  itemNumber?: number
  locationOptions: LocationOption[]
  isEditing: boolean
  submitting: boolean
  editingSubmitting: boolean
  deletingEntryId: string | null
  onBeginEdit: (entry: DisplayEntry) => void
  onCancelEdit: () => void
  onDelete: (entryId: string) => void
  onToggleInclude: (entryId: string, value: boolean) => void
  // Edit form bindings
  editingCondition: string
  setEditingCondition: (v: string) => void
  editingRemarkText: string
  setEditingRemarkText: (v: string) => void
  editingMediaCaptions: Record<string, string>
  setEditingMediaCaptions: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  editingError: string | null
  onSubmitEdit: React.FormEventHandler<HTMLFormElement>
  editingTasksForLocation: Task[]
  editingConditionsByTask: Record<string, string>
  setEditingConditionsByTask: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  editingFindingsByTask: Record<string, { condition: string; cause?: string; resolution?: string }>
  setEditingFindingsByTask: (updater: (prev: Record<string, { condition: string; cause?: string; resolution?: string }>) => Record<string, { condition: string; cause?: string; resolution?: string }>) => void
  onAddEntryMedia: (files: File[]) => void
  onAddFindingMedia: (taskId: string, files: File[]) => void
  onDeleteMedia: (mediaId: string) => void
  // Staged edit media
  editingAddedEntryPhotos: PendingMediaFile[]
  editingAddedEntryVideos: PendingMediaFile[]
  setEditingAddedEntryPhotos: (updater: (prev: PendingMediaFile[]) => PendingMediaFile[]) => void
  setEditingAddedEntryVideos: (updater: (prev: PendingMediaFile[]) => PendingMediaFile[]) => void
  editingAddedTaskPhotos: Record<string, PendingMediaFile[]>
  editingAddedTaskVideos: Record<string, PendingMediaFile[]>
  setEditingAddedTaskPhotos: (updater: (prev: Record<string, PendingMediaFile[]>) => Record<string, PendingMediaFile[]>) => void
  setEditingAddedTaskVideos: (updater: (prev: Record<string, PendingMediaFile[]>) => Record<string, PendingMediaFile[]>) => void
}

export default function EntryCard({
  entry,
  itemId,
  workOrderId,
  itemName,
  itemNumber,
  locationOptions,
  isEditing,
  submitting,
  editingSubmitting,
  deletingEntryId,
  onBeginEdit,
  onCancelEdit,
  onDelete,
  onToggleInclude,
  editingCondition,
  setEditingCondition,
  editingRemarkText,
  setEditingRemarkText,
  editingMediaCaptions,
  setEditingMediaCaptions,
  editingError,
  onSubmitEdit,
  editingTasksForLocation,
  editingConditionsByTask,
  setEditingConditionsByTask,
  editingFindingsByTask,
  setEditingFindingsByTask,
  onAddEntryMedia,
  onAddFindingMedia,
  onDeleteMedia,
  editingAddedEntryPhotos,
  editingAddedEntryVideos,
  setEditingAddedEntryPhotos,
  setEditingAddedEntryVideos,
  editingAddedTaskPhotos,
  editingAddedTaskVideos,
  setEditingAddedTaskPhotos,
  setEditingAddedTaskVideos,
}: Props) {
  const task = entry.task
  const locationFromEntry = (entry as any)?.location
  const locationIdFromEntry = (entry as any)?.locationId as string | undefined
  const locationFromTask = task?.location as any
  let locationId = (locationFromEntry?.id || locationFromTask?.id || locationIdFromEntry) as string | undefined
  let locationName: string | null = locationFromEntry?.name || locationFromTask?.name || null
  if (!locationName && locationId) {
    const locOpt = locationOptions.find((l) => l.id === locationId)
    if (locOpt) locationName = locOpt.name
  }
  const fallbackLocationName = !locationName && (task || locationFromEntry) ? (itemName ? `${itemName} — General` : 'General') : null
  locationName = locationName || fallbackLocationName

  // Index helpers: locationIndex.itemNumber.taskIndex (if task), e.g., 6.4.1
  const findLocationIndex = (locId?: string | null): number | null => {
    if (!locId) return null
    const idx = locationOptions.findIndex((l) => l.id === locId)
    return idx >= 0 ? idx + 1 : null
  }
  const findTaskIndex = (tid?: string | null): { locationIdx: number | null; taskIdx: number | null } => {
    if (!tid) return { locationIdx: null, taskIdx: null }
    for (let i = 0; i < locationOptions.length; i++) {
      const loc = locationOptions[i]
      const pos = (loc.tasks || []).findIndex((t) => t?.id === tid)
      if (pos >= 0) return { locationIdx: i + 1, taskIdx: pos + 1 }
    }
    return { locationIdx: null, taskIdx: null }
  }
  const resolvedLocationId = (locationFromEntry?.id || locationFromTask?.id || locationIdFromEntry) as string | undefined
  const locationIdx = findLocationIndex(resolvedLocationId)
  let indexLabel: string | null = null
  if (task?.id) {
    const { locationIdx: locIdxFromTask, taskIdx } = findTaskIndex(task.id)
    const loc = locationIdx || locIdxFromTask
    if (loc && itemNumber && taskIdx) indexLabel = `${loc}.${itemNumber}.${taskIdx}`
    else if (loc && taskIdx) indexLabel = `${loc}.${taskIdx}`
  } else {
    if (locationIdx && itemNumber) indexLabel = `${locationIdx}.${itemNumber}`
    else if (locationIdx) indexLabel = `${locationIdx}`
  }

  // Build per-entry finding summaries from ChecklistTaskFinding.details, not from ChecklistTask.condition
  type FindingSummary = { taskId: string; taskName: string; conditionLabel: string | null; cause?: string | null; resolution?: string | null }
  let findingSummaries: FindingSummary[] | null = null
  const entryFindings = (entry as any)?.findings as Array<{ taskId: string; details?: any | null }> | undefined
  if (Array.isArray(entryFindings) && entryFindings.length > 0) {
    const taskNameById = new Map<string, string>()
    locationOptions.forEach((loc) => {
      (loc.tasks || []).forEach((t) => {
        if (t?.id) taskNameById.set(t.id, t.name || 'Subtask')
      })
    })
    const rawSummaries = entryFindings.map((f) => {
      const name = taskNameById.get(f.taskId) || 'Subtask'
      const details = (f?.details && typeof f.details === 'object') ? f.details as any : {}
      const condRaw: string | null = typeof details.condition === 'string' ? details.condition : null
      const condLabel = condRaw ? formatCondition(condRaw) : null
      const cause = typeof details.cause === 'string' && details.cause.trim().length > 0 ? details.cause.trim() : null
      const resolution = typeof details.resolution === 'string' && details.resolution.trim().length > 0 ? details.resolution.trim() : null
      return { taskId: f.taskId, taskName: name, conditionLabel: condLabel, cause, resolution }
    })

    // Sort summaries by the contract checklist subtask order for this location
    const sortLocationId = (entry as any)?.location?.id || entry.task?.location?.id || locationIdFromEntry
    let loc = locationOptions.find((l) => l.id === sortLocationId)
    if (!loc) {
      // Infer location by best overlap between entryFinding taskIds and location.tasks
      const findingIds = new Set(entryFindings.map((f) => f.taskId).filter(Boolean))
      let best: { loc: typeof locationOptions[number] | null; score: number } = { loc: null, score: -1 }
      locationOptions.forEach((candidate) => {
        const ids = new Set((candidate.tasks || []).map((t) => t.id))
        let score = 0
        findingIds.forEach((id) => { if (ids.has(id)) score++ })
        if (score > best.score) best = { loc: candidate, score }
      })
      if (best.loc && best.score > 0) loc = best.loc
    }
    if (loc && Array.isArray(loc.tasks) && loc.tasks.length > 0) {
      const orderIndex = new Map<string, number>()
      loc.tasks.forEach((t, idx) => { if (t?.id) orderIndex.set(t.id, idx) })
      const pairs = entryFindings.map((f, i) => ({ s: rawSummaries[i], idx: orderIndex.get(f.taskId) ?? Number.MAX_SAFE_INTEGER }))
      findingSummaries = pairs.sort((a, b) => a.idx - b.idx).map(p => p.s)
    } else {
      findingSummaries = rawSummaries
    }
  }

  const createdBy = entry.inspector?.name || entry.user?.username || entry.user?.email || null
  const headlineBase = task?.name || createdBy || 'Remark'
  const headlineCore = locationName ? `${locationName} — ${headlineBase}` : headlineBase
  const headline = indexLabel ? `${indexLabel} · ${headlineCore}` : headlineCore
  const mediaContext = task?.name || locationName || createdBy || null
  const mediaLabel = buildMediaLabel(itemName, mediaContext)
  const cardClasses = `rounded-md border p-3 ${isEditing ? 'border-primary/60 bg-primary/5' : ''}`

  return (
    <div className={cardClasses}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-md font-medium">{headline}</p>
          {locationName ? (
            <p className="text-sm text-muted-foreground mt-0.5">
              {indexLabel ? (
                <span className="mr-1"> {indexLabel}</span>
              ) : null}
              Item: {locationName}
            </p>
          ) : null}
          {Array.isArray(findingSummaries) && findingSummaries.length > 0 ? (
            <div className="mt-0.5 space-y-1">
              {findingSummaries.map((f, idx) => {
                // Per-task index label for summary lines (use taskId from summary)
                const ti = findTaskIndex(f.taskId)
                const lineIndex = (ti.locationIdx && itemNumber && ti.taskIdx)
                  ? `${ti.locationIdx}.${itemNumber}.${ti.taskIdx}`
                  : (ti.locationIdx && ti.taskIdx) ? `${ti.locationIdx}.${ti.taskIdx}` : null
                return (
                  <div key={idx} className="text-sm text-muted-foreground">
                    <p>
                      {lineIndex ? `${lineIndex} ${f.taskName}` : f.taskName}: {f.conditionLabel || '—'}
                    </p>
                  {(f.cause || f.resolution) ? (
                    <div className="mt-0.5 ml-3 space-y-0.5">
                      {f.cause ? (
                        <p>Cause: {f.cause}</p>
                      ) : null}
                      {f.resolution ? (
                        <p>Resolution: {f.resolution}</p>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                )
              })}
            </div>
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
                  onCancelEdit()
                } else {
                  onBeginEdit(entry)
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
              onClick={() => onDelete(entry.id)}
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
              onChange={(event) => onToggleInclude(entry.id, event.target.checked)}
              disabled={editingSubmitting}
            />
            Use in final report
          </label>
        </div>
      </div>
      {isEditing ? (
        <EditRemarkForm
          entry={entry}
          editingCondition={editingCondition}
          setEditingCondition={setEditingCondition}
          editingRemarkText={editingRemarkText}
          setEditingRemarkText={setEditingRemarkText}
          editingMediaCaptions={editingMediaCaptions}
          setEditingMediaCaptions={setEditingMediaCaptions}
          editingError={editingError}
          editingSubmitting={editingSubmitting}
          onCancel={onCancelEdit}
          onSubmit={onSubmitEdit}
          editingTasksForLocation={editingTasksForLocation}
          editingConditionsByTask={editingConditionsByTask}
          setEditingConditionsByTask={setEditingConditionsByTask}
          locationOptions={locationOptions}
          onAddEntryMedia={onAddEntryMedia}
          onAddFindingMedia={onAddFindingMedia}
          onDeleteMedia={onDeleteMedia}
          editingFindingsByTask={editingFindingsByTask}
          setEditingFindingsByTask={setEditingFindingsByTask}
          addedEntryPhotos={editingAddedEntryPhotos}
          addedEntryVideos={editingAddedEntryVideos}
          updateAddedEntryPhotoCaption={(index, caption) => setEditingAddedEntryPhotos((prev) => prev.map((e, i) => i === index ? { ...e, caption } : e))}
          updateAddedEntryVideoCaption={(index, caption) => setEditingAddedEntryVideos((prev) => prev.map((e, i) => i === index ? { ...e, caption } : e))}
          removeAddedEntryPhotoAt={(index) => setEditingAddedEntryPhotos((prev) => prev.filter((_, i) => i !== index))}
          removeAddedEntryVideoAt={(index) => setEditingAddedEntryVideos((prev) => prev.filter((_, i) => i !== index))}
          addedTaskPhotos={editingAddedTaskPhotos}
          addedTaskVideos={editingAddedTaskVideos}
          updateAddedTaskPhotoCaption={(taskId, index, caption) => setEditingAddedTaskPhotos((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).map((e, i) => i === index ? { ...e, caption } : e) }))}
          updateAddedTaskVideoCaption={(taskId, index, caption) => setEditingAddedTaskVideos((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).map((e, i) => i === index ? { ...e, caption } : e) }))}
          removeAddedTaskPhotoAt={(taskId, index) => setEditingAddedTaskPhotos((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).filter((_, i) => i !== index) }))}
          removeAddedTaskVideoAt={(taskId, index) => setEditingAddedTaskVideos((prev) => ({ ...prev, [taskId]: (prev[taskId] || []).filter((_, i) => i !== index) }))}
          itemNumber={itemNumber}
        />
      ) : entry.remarks ? (
        <p className="text-sm text-muted-foreground mt-2">
          <span className="font-medium text-foreground">Remarks:</span> {entry.remarks}
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
          itemNumber={itemNumber}
          locationOptions={locationOptions.map((l) => ({ id: l.id, name: l.name, tasks: (l.tasks || []).map((t) => ({ id: t.id, name: t.name })) }))}
          defaultLocationId={resolvedLocationId}
        />
      </div>
    </div>
  )
}
