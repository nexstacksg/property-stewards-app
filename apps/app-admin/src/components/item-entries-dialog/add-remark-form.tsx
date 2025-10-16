"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, X } from "lucide-react"
import { PendingMediaFile, Task } from "./types"
import { CONDITION_OPTIONS } from "./utils"
import { RefObject } from "react"

type LocationOption = { id: string; name: string; tasks: Task[] }

type Props = {
  itemId: string
  workOrderId: string
  locationOptions: LocationOption[]
  selectedLocationId: string
  setSelectedLocationId: (id: string) => void
  availableTasks: Task[]
  conditionsByTask: Record<string, string>
  setConditionsByTask: (next: Record<string, string>) => void
  remarkText: string
  setRemarkText: (v: string) => void
  causeText: string
  setCauseText: (v: string) => void
  resolutionText: string
  setResolutionText: (v: string) => void
  submitting: boolean
  formError: string | null
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onCancel: () => void
  photoFiles: PendingMediaFile[]
  videoFiles: PendingMediaFile[]
  updatePhotoCaption: (index: number, caption: string) => void
  updateVideoCaption: (index: number, caption: string) => void
  removePhotoAt: (index: number) => void
  removeVideoAt: (index: number) => void
  onMediaSelection: React.ChangeEventHandler<HTMLInputElement>
  onClearMedia: () => void
  mediaInputRef: RefObject<HTMLInputElement>
}

export default function AddRemarkForm({
  itemId,
  workOrderId,
  locationOptions,
  selectedLocationId,
  setSelectedLocationId,
  availableTasks,
  conditionsByTask,
  setConditionsByTask,
  remarkText,
  setRemarkText,
  causeText,
  setCauseText,
  resolutionText,
  setResolutionText,
  submitting,
  formError,
  onSubmit,
  onCancel,
  photoFiles,
  videoFiles,
  updatePhotoCaption,
  updateVideoCaption,
  removePhotoAt,
  removeVideoAt,
  onMediaSelection,
  onClearMedia,
  mediaInputRef,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border bg-background p-4 shadow-sm">
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
        <div className="space-y-2 md:col-span-2">
          <Label>Conditions for subtasks</Label>
          {availableTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subtasks for this location.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex flex-col gap-4 min-w-max">
                {availableTasks.map((task) => (
                  <div key={task.id} className="flex justify-between items-center gap-2">
                    <span className="text-xs text-muted-foreground  truncate" title={task.name || 'Untitled subtask'}>
                      {task.name || 'Untitled subtask'}
                    </span>
                    <select
                      className="h-8 w-55 rounded-md border  text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                      value={conditionsByTask[task.id] ?? ''}
                      onChange={(e) => setConditionsByTask({ ...conditionsByTask, [task.id]: e.target.value })}
                      disabled={submitting}
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
      </div>
      <div className="space-y-2">
        <Label htmlFor={`remark-text-${itemId}`}>Remarks (location)</Label>
        <textarea
          id={`remark-text-${itemId}`}
          className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
          value={remarkText}
          onChange={(event) => setRemarkText(event.target.value)}
          placeholder="Add context for this location"
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
                    onClick={onClearMedia}
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
          onChange={onMediaSelection}
          disabled={submitting}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !selectedLocationId}>
          {submitting ? "Saving..." : "Save Remark"}
        </Button>
      </div>
    </form>
  )
}

