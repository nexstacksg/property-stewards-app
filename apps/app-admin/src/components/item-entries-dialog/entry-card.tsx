"use client"

import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import EditRemarkForm from "./edit-remark-form"
import { DisplayEntry, Task } from "./types"
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
  editingCauseText: string
  setEditingCauseText: (v: string) => void
  editingResolutionText: string
  setEditingResolutionText: (v: string) => void
  editingMediaCaptions: Record<string, string>
  setEditingMediaCaptions: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  editingError: string | null
  onSubmitEdit: React.FormEventHandler<HTMLFormElement>
  editingTasksForLocation: Task[]
  editingConditionsByTask: Record<string, string>
  setEditingConditionsByTask: (updater: (prev: Record<string, string>) => Record<string, string>) => void
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
  editingCauseText,
  setEditingCauseText,
  editingResolutionText,
  setEditingResolutionText,
  editingMediaCaptions,
  setEditingMediaCaptions,
  editingError,
  onSubmitEdit,
  editingTasksForLocation,
  editingConditionsByTask,
  setEditingConditionsByTask,
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

  let conditionSummary: string[] | null = null
  if (!locationId && fallbackLocationName) {
    const unassigned = locationOptions.find((l) => l.id === 'unassigned')
    if (unassigned) locationId = 'unassigned'
  }
  if (locationId) {
    const loc = locationOptions.find((l) => l.id === locationId)
    if (loc) {
      conditionSummary = (loc.tasks || []).map((t: any) => `${t.name || 'Subtask'}: ${formatCondition(t.condition) || '—'}`)
    }
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
          {Array.isArray(conditionSummary) && conditionSummary.length > 0 ? (
            <div className="mt-0.5 space-y-0.5">
              {conditionSummary.map((line: string, idx: number) => (
                <p key={idx} className="text-xs text-muted-foreground">{line}</p>
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
          editingCauseText={editingCauseText}
          setEditingCauseText={setEditingCauseText}
          editingResolutionText={editingResolutionText}
          setEditingResolutionText={setEditingResolutionText}
          editingMediaCaptions={editingMediaCaptions}
          setEditingMediaCaptions={setEditingMediaCaptions}
          editingError={editingError}
          editingSubmitting={editingSubmitting}
          onCancel={onCancelEdit}
          onSubmit={onSubmitEdit}
          editingTasksForLocation={editingTasksForLocation}
          editingConditionsByTask={editingConditionsByTask}
          setEditingConditionsByTask={setEditingConditionsByTask}
        />
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
}
