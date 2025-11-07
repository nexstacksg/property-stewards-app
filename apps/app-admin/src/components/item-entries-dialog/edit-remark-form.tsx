"use client"

import { useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CONDITION_OPTIONS } from "./utils"
import { DisplayEntry, Task } from "./types"
import { Upload, Trash2 } from "lucide-react"

type Props = {
  entry: DisplayEntry
  editingCondition: string
  setEditingCondition: (v: string) => void
  editingRemarkText: string
  setEditingRemarkText: (v: string) => void
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
  // Findings UI helpers
  locationOptions: { id: string; name: string; tasks: Task[] }[]
  onAddEntryMedia?: (files: File[], captions?: string[]) => void
  onAddFindingMedia?: (taskId: string, files: File[], captions?: string[]) => void
  onDeleteMedia?: (mediaId: string) => void
  editingFindingsByTask: Record<string, { condition: string; cause?: string; resolution?: string }>
  setEditingFindingsByTask: (updater: (prev: Record<string, { condition: string; cause?: string; resolution?: string }>) => Record<string, { condition: string; cause?: string; resolution?: string }>) => void
  // Staged additions for edit (not persisted until submit)
  addedEntryPhotos: import('./types').PendingMediaFile[]
  addedEntryVideos: import('./types').PendingMediaFile[]
  updateAddedEntryPhotoCaption: (index: number, caption: string) => void
  updateAddedEntryVideoCaption: (index: number, caption: string) => void
  removeAddedEntryPhotoAt: (index: number) => void
  removeAddedEntryVideoAt: (index: number) => void
  addedTaskPhotos: Record<string, import('./types').PendingMediaFile[]>
  addedTaskVideos: Record<string, import('./types').PendingMediaFile[]>
  updateAddedTaskPhotoCaption: (taskId: string, index: number, caption: string) => void
  updateAddedTaskVideoCaption: (taskId: string, index: number, caption: string) => void
  removeAddedTaskPhotoAt: (taskId: string, index: number) => void
  removeAddedTaskVideoAt: (taskId: string, index: number) => void
  // Optional: checklist item number used to prefix indices
  itemNumber?: number
}

export default function EditRemarkForm({
  entry,
  editingCondition,
  setEditingCondition,
  editingRemarkText,
  setEditingRemarkText,
  editingMediaCaptions,
  setEditingMediaCaptions,
  editingError,
  editingSubmitting,
  onCancel,
  onSubmit,
  editingTasksForLocation,
  editingConditionsByTask,
  setEditingConditionsByTask,
  locationOptions,
  onAddEntryMedia,
  onAddFindingMedia,
  onDeleteMedia,
  editingFindingsByTask,
  setEditingFindingsByTask,
  addedEntryPhotos,
  addedEntryVideos,
  updateAddedEntryPhotoCaption,
  updateAddedEntryVideoCaption,
  removeAddedEntryPhotoAt,
  removeAddedEntryVideoAt,
  addedTaskPhotos,
  addedTaskVideos,
  updateAddedTaskPhotoCaption,
  updateAddedTaskVideoCaption,
  removeAddedTaskPhotoAt,
  removeAddedTaskVideoAt,
  itemNumber,
}: Props) {
  // Global task order across all locations (preserves location order, then subtask order)
  const taskOrder = useMemo(() => {
    const map = new Map<string, number>()
    let pos = 0
    locationOptions.forEach((loc) => {
      (loc.tasks || []).forEach((t) => { if (t?.id && !map.has(t.id)) map.set(t.id, pos++) })
    })
    return map
  }, [locationOptions])
  const taskNameById = useMemo(() => {
    const map = new Map<string, string>()
    locationOptions.forEach((loc) => (loc.tasks || []).forEach((t) => { if (t?.id) map.set(t.id, t.name || 'Subtask') }))
    return map
  }, [locationOptions])

  const locationMedia = useMemo(() => (entry.media || []).filter((m: any) => !m.taskId), [entry.media])
  const mediaByTaskId = useMemo(() => {
    const g = new Map<string, any[]>()
    ;(entry.media || []).forEach((m: any) => {
      const tid = m.taskId
      if (!tid) return
      if (!g.has(tid)) g.set(tid, [])
      g.get(tid)!.push(m)
    })
    return g
  }, [entry.media])

  // Quick lookup for index prefix by task id (location position + task position)
  const indexByTaskId = useMemo(() => {
    const map = new Map<string, { loc: number; idx: number }>()
    locationOptions.forEach((loc, locPos) => {
      (loc.tasks || []).forEach((t, tPos) => {
        if (t?.id) map.set(t.id, { loc: locPos + 1, idx: tPos + 1 })
      })
    })
    return map
  }, [locationOptions])

  const entryMediaInputRef = useRef<HTMLInputElement>(null)
  const findingMediaInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const setFindingRef = (taskId: string, el: HTMLInputElement | null) => { findingMediaInputRefs.current[taskId] = el }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-md border bg-background p-3 shadow-sm">
      {editingError && (
        <p className="text-sm text-destructive">{editingError}</p>
      )}
      {/* Removed top-level Conditions for subtasks section and moved Remarks below findings as requested */}
      {/* Conditions for subtasks */}
      {Array.isArray((entry as any).findings) && (entry as any).findings.length > 0 ? (
        <div className="space-y-3">
          <Label>Conditions for subtasks</Label>
          <div className="space-y-3">
            {((entry as any).findings as any[])
              .slice()
              .sort((a, b) => (taskOrder.get(a.taskId) ?? Number.MAX_SAFE_INTEGER) - (taskOrder.get(b.taskId) ?? Number.MAX_SAFE_INTEGER))
              .map((f) => {
              const taskId = f.taskId as string
              const taskName = taskNameById.get(taskId) || 'Subtask'
              const details = (f.details || {}) as any
              const current = editingFindingsByTask[taskId] || { condition: (details.condition || '') as string, cause: details.cause as any, resolution: details.resolution as any }
              const condValue = current.condition || ''
              const causeValue = current.cause || ''
              const resolutionValue = current.resolution || ''
              const media = mediaByTaskId.get(taskId) || []
              const ix = indexByTaskId.get(taskId)
              const prefix = ix ? (itemNumber ? `${ix.loc}.${itemNumber}.${ix.idx}` : `${ix.loc}.${ix.idx}`) : null
              const showCR = condValue === 'FAIR' || condValue === 'UNSATISFACTORY'
              return (
                <div key={f.id} className="rounded-md border border-dashed border-muted-foreground/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium w-60" title={taskName}>{prefix ? `${prefix} ${taskName}` : taskName}</div>
                    <select
                      className="h-8 w-56 rounded-md border text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                      value={condValue}
                      onChange={(e) => { const v = e.target.value; setEditingFindingsByTask((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), condition: v } })) }}
                      disabled={editingSubmitting}
                    >
                      {CONDITION_OPTIONS.map((option) => (
                        <option key={option.value || 'empty'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {showCR ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Cause</Label>
                        <textarea
                          className="w-full min-h-[72px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                          value={causeValue}
                          onChange={(e) => { const v = e.target.value; setEditingFindingsByTask((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || { condition: condValue }), cause: v } })) }}
                          disabled={editingSubmitting}
                          placeholder="Describe the suspected cause"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Resolution</Label>
                        <textarea
                          className="w-full min-h-[72px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
                          value={resolutionValue}
                          onChange={(e) => { const v = e.target.value; setEditingFindingsByTask((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || { condition: condValue }), resolution: v } })) }}
                          disabled={editingSubmitting}
                          placeholder="Outline the recommended resolution"
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Attachments (task)</Label>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => findingMediaInputRefs.current[taskId]?.click()} disabled={editingSubmitting} title="Add photos or videos">
                        <Upload className="h-4 w-4" />
                      </Button>
                      <input ref={(el) => setFindingRef(taskId, el)} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) onAddFindingMedia?.(taskId, files); e.currentTarget.value=''; }} />
                    </div>
                {media.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No media for this subtask yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {media.map((mediaItem: any) => {
                          const isPhoto = mediaItem.type === 'PHOTO'
                          const captionValue = editingMediaCaptions[mediaItem.id] ?? mediaItem.caption ?? ''
                          return (
                            <div key={mediaItem.id} className="rounded-md border border-dashed border-muted-foreground/30 p-3">
                              <div className="flex items-start gap-3">
                                {isPhoto ? (
                                  <img src={mediaItem.url} alt={captionValue ? `${captionValue} preview` : 'Photo preview'} className="h-20 w-20 rounded object-cover border" />
                                ) : (
                                  <video src={mediaItem.url} className="h-20 w-32 rounded border" controls={false} muted />
                                )}
                                <div className="flex-1 space-y-2">
                                  <input type="text" className="mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300" value={captionValue} onChange={(event) => setEditingMediaCaptions((prev) => ({ ...prev, [mediaItem.id]: event.target.value }))} placeholder="Add a caption" disabled={editingSubmitting} />
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteMedia?.(mediaItem.id)} title="Delete media">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Staged new media (task) */}
                    {((addedTaskPhotos[taskId] || []).length > 0 || (addedTaskVideos[taskId] || []).length > 0) ? (
                      <div className="mt-2 space-y-2 text-sm">
                        {(addedTaskPhotos[taskId] || []).map((entry, index) => (
                          <div key={`staged-tphoto-${taskId}-${index}-${entry.file.name}`} className="rounded border bg-background px-2 py-2 text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate">Photo: {entry.file.name || `photo-${index + 1}`}</span>
                              <button type="button" onClick={() => removeAddedTaskPhotoAt(taskId, index)} className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove staged photo">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input type="text" className="mt-2 w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-0 focus:border-gray-300" value={entry.caption} onChange={(e) => updateAddedTaskPhotoCaption(taskId, index, e.target.value)} placeholder="Caption (optional)" />
                          </div>
                        ))}
                        {(addedTaskVideos[taskId] || []).map((entry, index) => (
                          <div key={`staged-tvideo-${taskId}-${index}-${entry.file.name}`} className="rounded border bg-background px-2 py-2 text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate">Video: {entry.file.name || `video-${index + 1}`}</span>
                              <button type="button" onClick={() => removeAddedTaskVideoAt(taskId, index)} className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove staged video">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input type="text" className="mt-2 w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-0 focus:border-gray-300" value={entry.caption} onChange={(e) => updateAddedTaskVideoCaption(taskId, index, e.target.value)} placeholder="Caption (optional)" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Remarks moved here, before location attachments */}
      <div className="space-y-2">
        <Label htmlFor={`edit-remark-${entry.id}`}>Remarks</Label>
        <textarea
          id={`edit-remark-${entry.id}`}
          className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300"
          value={editingRemarkText}
          onChange={(event) => setEditingRemarkText(event.target.value)}
          disabled={editingSubmitting}
          placeholder="Update the note for this location"
        />
      </div>

      {/* Location-level attachments */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Attachments (location)</Label>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => entryMediaInputRef.current?.click()} disabled={editingSubmitting} title="Add photos or videos">
            <Upload className="h-4 w-4" />
          </Button>
          <input ref={entryMediaInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) onAddEntryMedia?.(files); e.currentTarget.value=''; }} />
        </div>
        {(locationMedia && locationMedia.length > 0) ? (
          <div className="space-y-3">
            {locationMedia.map((mediaItem: any) => {
              const isPhoto = mediaItem.type === 'PHOTO'
              const captionValue = editingMediaCaptions[mediaItem.id] ?? mediaItem.caption ?? ''
              return (
                <div key={mediaItem.id} className="rounded-md border border-dashed border-muted-foreground/30 p-3">
                  <div className="flex items-start gap-3">
                    {isPhoto ? (
                      <img src={mediaItem.url} alt={captionValue ? `${captionValue} preview` : 'Photo preview'} className="h-20 w-20 rounded object-cover border" />
                    ) : (
                      <video src={mediaItem.url} className="h-20 w-32 rounded border" controls={false} muted />
                    )}
                    <div className="flex-1 space-y-2">
                      <input type="text" className="mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0 focus:border-gray-300" value={captionValue} onChange={(event) => setEditingMediaCaptions((prev) => ({ ...prev, [mediaItem.id]: event.target.value }))} placeholder="Add a caption" disabled={editingSubmitting} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteMedia?.(mediaItem.id)} title="Delete media">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No media added to this location yet.</p>
        )}

        {/* Staged location-level additions */}
        {(addedEntryPhotos.length > 0 || addedEntryVideos.length > 0) ? (
          <div className="space-y-2">
            {addedEntryPhotos.map((entry, index) => (
              <div key={`staged-photo-${index}-${entry.file.name}`} className="rounded border bg-background px-2 py-2 text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">Photo: {entry.file.name || `photo-${index + 1}`}</span>
                  <button type="button" onClick={() => removeAddedEntryPhotoAt(index)} className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove staged photo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input type="text" className="mt-2 w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-0 focus:border-gray-300" value={entry.caption} onChange={(e) => updateAddedEntryPhotoCaption(index, e.target.value)} placeholder="Caption (optional)" />
              </div>
            ))}
            {addedEntryVideos.map((entry, index) => (
              <div key={`staged-video-${index}-${entry.file.name}`} className="rounded border bg-background px-2 py-2 text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">Video: {entry.file.name || `video-${index + 1}`}</span>
                  <button type="button" onClick={() => removeAddedEntryVideoAt(index)} className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove staged video">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input type="text" className="mt-2 w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-0 focus:border-gray-300" value={entry.caption} onChange={(e) => updateAddedEntryVideoCaption(index, e.target.value)} placeholder="Caption (optional)" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
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
