"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CONDITION_OPTIONS } from "./utils"
import { DisplayEntry, Task } from "./types"

type Props = {
  entry: DisplayEntry
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
  editingSubmitting: boolean
  onCancel: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  // Location-level editing support
  editingTasksForLocation: Task[]
  editingConditionsByTask: Record<string, string>
  setEditingConditionsByTask: (updater: (prev: Record<string, string>) => Record<string, string>) => void
}

export default function EditRemarkForm({
  entry,
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
  editingSubmitting,
  onCancel,
  onSubmit,
  editingTasksForLocation,
  editingConditionsByTask,
  setEditingConditionsByTask,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-md border bg-background p-3 shadow-sm">
      {editingError && (
        <p className="text-sm text-destructive">{editingError}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {entry.task ? (
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
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <Label>Conditions for subtasks</Label>
            {editingTasksForLocation.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subtasks for this location.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex flex-col  gap-4 min-w-max">
                  {editingTasksForLocation.map((task) => (
                    <div key={task.id} className="flex justify-between  gap-2">
                      <span className="text-xs text-muted-foreground truncate" title={task.name || 'Untitled subtask'}>
                        {task.name || 'Untitled subtask'}
                      </span>
                      <select
                        className="h-8 w-55 rounded-md border px-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                        value={editingConditionsByTask[task.id] ?? ''}
                        onChange={(e) => setEditingConditionsByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                        disabled={editingSubmitting}
                      >
                        {CONDITION_OPTIONS.map((option) => (
                          <option key={option.value || 'empty'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
        <Button type="button" variant="outline" onClick={onCancel} disabled={editingSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={editingSubmitting}>
          {editingSubmitting ? 'Saving...' : 'Update Remark'}
        </Button>
      </div>
    </form>
  )
}
