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

  // Build per-entry finding summaries from ChecklistTaskFinding.details, not from ChecklistTask.condition
  type FindingSummary = { taskName: string; conditionLabel: string | null; cause?: string | null; resolution?: string | null }
  let findingSummaries: FindingSummary[] | null = null
  const entryFindings = (entry as any)?.findings as Array<{ taskId: string; details?: any | null }> | undefined
  if (Array.isArray(entryFindings) && entryFindings.length > 0) {
    const taskNameById = new Map<string, string>()
    locationOptions.forEach((loc) => {
      (loc.tasks || []).forEach((t) => {
        if (t?.id) taskNameById.set(t.id, t.name || 'Subtask')
      })
    })
    findingSummaries = entryFindings.map((f) => {
      const name = taskNameById.get(f.taskId) || 'Subtask'
      const details = (f?.details && typeof f.details === 'object') ? f.details as any : {}
      const condRaw: string | null = typeof details.condition === 'string' ? details.condition : null
      const condLabel = condRaw ? formatCondition(condRaw) : null
      const cause = typeof details.cause === 'string' && details.cause.trim().length > 0 ? details.cause.trim() : null
      const resolution = typeof details.resolution === 'string' && details.resolution.trim().length > 0 ? details.resolution.trim() : null
      return { taskName: name, conditionLabel: condLabel, cause, resolution }
    })
  }

  const createdBy = entry.inspector?.name || entry.user?.username || entry.user?.email || null
  const headlineBase = task?.name || createdBy || 'Remark'
  const headline = locationName ? `${locationName} — ${headlineBase}` : headlineBase
  const mediaContext = task?.name || locationName || createdBy || null
  const mediaLabel = buildMediaLabel(itemName, mediaContext)
  const cardClasses = `rounded-md border p-3 ${isEditing ? 'border-primary/60 bg-primary/5' : ''}`

  return (
    <div className={cardClasses}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">{headline}</p>
          {locationName ? (
            <p className="text-xs text-muted-foreground mt-0.5">Location: {locationName}</p>
          ) : null}
          {Array.isArray(findingSummaries) && findingSummaries.length > 0 ? (
            <div className="mt-0.5 space-y-1">
              {findingSummaries.map((f, idx) => (
                <div key={idx} className="text-xs text-muted-foreground">
                  <p>
                    {f.taskName}: {f.conditionLabel || '—'}
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
              ))}
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
        />
      </div>
    </div>
  )
}
