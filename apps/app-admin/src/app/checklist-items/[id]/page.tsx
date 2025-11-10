import { notFound } from 'next/navigation'
import { formatDateLocal, formatDateTimeLocal } from '@/lib/time'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import prisma from '@/lib/prisma'
import ItemEntriesDialog from '@/components/item-entries-dialog'
import { extractEntryMedia, mergeMediaLists, stringsToAttachments, stringsToAttachmentsWithTask, type MediaAttachment } from '@/lib/media-utils'
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  FileText,
  FolderOpen,
  MapPin,
  User
} from 'lucide-react'

function formatDate(value: Date | string | null | undefined) {
  return formatDateLocal(value)
}

function formatDateTime(value: Date | string | null | undefined) {
  return formatDateTimeLocal(value)
}

async function getChecklistItem(id: string) {
  const checklistItem = await prisma.contractChecklistItem.findUnique({
    where: { id },
    include: {
      contractChecklist: {
        include: {
          contract: {
            include: {
              customer: true,
              address: true,
              workOrders: {
                select: {
                  id: true
                }
              }
            }
          },
          items: {
            select: { id: true, order: true },
            orderBy: { order: 'asc' }
          }
        }
      },
      checklistTasks: {
        include: {
          entries: {
            include: {
              inspector: { select: { id: true, name: true } },
              user: { select: { id: true, username: true, email: true } },
              media: {
                orderBy: { order: 'asc' }
              }
            },
            orderBy: [
              { createdOn: 'asc' }
            ]
          }as any
        },
        orderBy: [
          { order: 'asc' },
          { createdOn: 'asc' }
        ]
      },
      locations: {
        include: {
          tasks: {
            include: {
              entries: {
                select: { id: true }
              }
            },
            orderBy: [
              { order: 'asc' },
              { createdOn: 'asc' }
            ]
          }
        },
        orderBy: { order: 'asc' }
      },
      contributions: {
        include: {
          inspector: { select: { id: true, name: true } },
          user: { select: { id: true, username: true, email: true } },
          media: {
            orderBy: { order: 'asc' }
          },
          task: {
            select: {
              id: true
            }
          },
          location: true,
          findings: true
        }as any
      }
    }
  })

  return checklistItem
}

export default async function ChecklistItemDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const checklistItem = await getChecklistItem(id)

  if (!checklistItem) {
    notFound()
  }

  const contract = checklistItem.contractChecklist?.contract
  const itemNumber = (() => {
    const items = (checklistItem.contractChecklist as any)?.items as Array<{ id: string }>|undefined
    if (!Array.isArray(items)) return undefined
    const pos = items.findIndex((it) => it.id === checklistItem.id)
    return pos >= 0 ? pos + 1 : undefined
  })()
  const tasks = Array.isArray(checklistItem.checklistTasks) ? checklistItem.checklistTasks : []
  const subtaskNames = tasks
    .map((task: any) => (typeof task.name === 'string' ? task.name.trim() : ''))
    .filter((name: string) => name.length > 0)
  const subtaskSummary = subtaskNames.length > 0 ? subtaskNames.join(', ') : 'No subtasks assigned'
  const standaloneEntries = (Array.isArray(checklistItem.contributions) ? checklistItem.contributions : []).filter(
    (entry: any) => !entry.task
  )
  const allEntries = Array.isArray(checklistItem.contributions) ? checklistItem.contributions : []
  const itemPhotos = stringsToAttachments(checklistItem.photos)
  const itemVideos = stringsToAttachments(checklistItem.videos)
  const dialogTasks = tasks.map((task: any) => ({
    id: task.id,
    name: task.name,
    status: task.status,
    condition: task.condition,
    photos: task.photos,
    videos: task.videos,
    entries: Array.isArray(task.entries) ? task.entries.map((entry: any) => ({ id: entry.id })) : [],
    location: task.location
  }))
  const primaryWorkOrderId =
    checklistItem.contractChecklist?.contract?.workOrders?.[0]?.id ?? 'unknown'
  const remarkButtonLabel = `Add Remarks`

  const totalRemarks =
    tasks.reduce(
      (count: number, task: any) => count + (Array.isArray(task.entries) ? task.entries.length : 0),
      0
    ) + standaloneEntries.length

  const taskPhotoAttachments = mergeMediaLists(tasks.map((task: any) => stringsToAttachmentsWithTask(task.photos, task.id)))
  const taskVideoAttachments = mergeMediaLists(tasks.map((task: any) => stringsToAttachmentsWithTask(task.videos, task.id)))
  const entryPhotoAttachments = mergeMediaLists(allEntries.map((entry: any) => extractEntryMedia(entry, 'PHOTO')))
  const entryVideoAttachments = mergeMediaLists(allEntries.map((entry: any) => extractEntryMedia(entry, 'VIDEO')))
  const entryTaskPhotoAttachments = mergeMediaLists(allEntries.map((entry: any) => stringsToAttachmentsWithTask(entry.task?.photos, entry.task?.id)))
  const entryTaskVideoAttachments = mergeMediaLists(allEntries.map((entry: any) => stringsToAttachmentsWithTask(entry.task?.videos, entry.task?.id)))

  const combinedItemPhotos = mergeMediaLists([itemPhotos, taskPhotoAttachments, entryPhotoAttachments, entryTaskPhotoAttachments])
  const combinedItemVideos = mergeMediaLists([itemVideos, taskVideoAttachments, entryVideoAttachments, entryTaskVideoAttachments])

  const displayItemPhotos = combinedItemPhotos.length > 0 ? combinedItemPhotos : itemPhotos
  const displayItemVideos = combinedItemVideos.length > 0 ? combinedItemVideos : itemVideos

  const totalMedia = displayItemPhotos.length + displayItemVideos.length

  // Build location-centric view: group tasks and remarks by location
  const locations: Array<{ id: string; name?: string | null; tasks: any[] }> = Array.isArray(checklistItem.locations)
    ? checklistItem.locations.map((loc: any) => ({ id: loc.id, name: loc.name, tasks: Array.isArray(loc.tasks) ? loc.tasks : [] }))
    : []
  const locationIndexById = new Map<string, number>()
  locations.forEach((loc, idx) => locationIndexById.set(loc.id, idx + 1))
  const taskById = new Map<string, any>()
  const taskIndexById = new Map<string, { loc: number; idx: number; name?: string | null }>()
  tasks.forEach((t: any) => { if (t?.id) taskById.set(t.id, t) })
  locations.forEach((loc) => {
    (loc.tasks || []).forEach((t: any, tpos: number) => {
      if (t?.id) taskIndexById.set(t.id, { loc: locationIndexById.get(loc.id) || 0, idx: tpos + 1, name: t.name })
    })
  })
  type LocGroup = { id: string; name?: string | null; tasks: any[]; entries: any[] }
  const locGroups = new Map<string, LocGroup>()
  locations.forEach((loc) => locGroups.set(loc.id, { id: loc.id, name: loc.name, tasks: loc.tasks || [], entries: [] }))
  allEntries.forEach((entry: any) => {
    let locId: string | undefined = entry?.location?.id || entry?.locationId || undefined
    if (!locId && entry?.task?.id) {
      const t = taskById.get(entry.task.id)
      locId = t?.location?.id
    }
    if (locId && locGroups.has(locId)) {
      locGroups.get(locId)!.entries.push(entry)
    }
  })

  // Helpers to build index + caption + finding summaries
  const buildIndex = (att: MediaAttachment): string | null => {
    const tid = (att as any).taskId as string | undefined
    if (tid && taskIndexById.has(tid)) {
      const idx = taskIndexById.get(tid)!
      if (itemNumber) return `${idx.loc}.${itemNumber}.${idx.idx}`
      return `${idx.loc}.${idx.idx}`
    }
    const locId = (att as any).locationId as string | undefined
    const locIdx = locId ? locationIndexById.get(locId) : undefined
    if (locIdx && itemNumber) return `${locIdx}.${itemNumber}`
    return null
  }
  const buildCaption = (att: MediaAttachment): string | null => {
    const idx = buildIndex(att)
    const tid = (att as any).taskId as string | undefined
    const taskName = tid ? (taskIndexById.get(tid)?.name || null) : null
    const base = att.caption || taskName || null
    if (idx && base) return `${idx} ${base}`
    if (idx) return idx
    return base
  }

  return (
    <div className="space-y-6 bg-slate-50/60 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/work-orders">
            <Button variant="ghost" size="icon" aria-label="Back to work orders">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold leading-tight">{checklistItem.name || 'Checklist Item'}</h1>
            <p className="text-sm text-muted-foreground">Deep dive into subtasks, remarks, and supporting media.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ItemEntriesDialog
            itemId={checklistItem.id}
            workOrderId={primaryWorkOrderId}
            entries={allEntries}
            tasks={dialogTasks}
            locations={Array.isArray(checklistItem.locations) ? checklistItem.locations : []}
            itemName={checklistItem.name}
            locationTitle={Array.isArray(checklistItem.locations) && checklistItem.locations[0]?.name || null}
            locationTitleIndex={Array.isArray(checklistItem.locations) ? 1 : null}
            triggerLabel={remarkButtonLabel}
          />
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                {contract ? (
                  <>
                    <Link href={`/contracts/${contract.id}`} className="underline underline-offset-4">
                      Contract #{contract.id.slice(-6).toUpperCase()}
                    </Link>
                    <span>•</span>
                    <Link href={`/customers/${contract.customerId}`} className="underline underline-offset-4">
                      {contract.customer?.name}
                    </Link>
                  </>
                ) : (
                  <span>No contract linked</span>
                )}
              </div>
            
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-white/80 p-3 text-center shadow-sm">
                <p className="text-xs uppercase text-muted-foreground">Subtasks</p>
                <p className="mt-1 text-2xl font-semibold">{tasks.length}</p>
              </div>
              <div className="rounded-md border bg-white/80 p-3 text-centered shadow-sm">
                <p className="text-xs uppercase text-muted-foreground">Remarks</p>
                <p className="mt-1 text-2xl font-semibold">{totalRemarks}</p>
              </div>
              <div className="rounded-md border bg-white/80 p-3 text-centered shadow-sm">
                <p className="text-xs uppercase text-muted-foreground">Media</p>
                <p className="mt-1 text-2xl font-semibold">{totalMedia}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-4 w-4" /> Overview
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-4 text-sm">
              
                <div>
                  <p className="text-muted-foreground">Entered On</p>
                  <p className="font-medium">{formatDateTime(checklistItem.enteredOn)}</p>
                </div>
               
                 <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{checklistItem.status || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Subtasks</p>
                  <p className="font-medium truncate" title={subtaskSummary}>{subtaskSummary}</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-4 w-4" /> Contract Snapshot
              </h3>
              {contract ? (
                <div className="mt-3 grid gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-medium">{contract.customer?.name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Property</p>
                    <p className="font-medium">{contract.address?.address || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">{contract.address?.postalCode}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Schedule</p>
                    <p className="font-medium">
                      {formatDate(contract.scheduledStartDate)} – {formatDate(contract.scheduledEndDate)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No contract information available.</p>
              )}
            </div>
          </div>

          {(displayItemPhotos.length > 0 || displayItemVideos.length > 0) && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Item Media</h3>
              {displayItemPhotos.length > 0 && (
                <div>
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Photos</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {displayItemPhotos.map((photo: MediaAttachment, index: number) => (
                      <div key={`${photo.url}-${index}`} className="group space-y-2 overflow-hidden rounded-lg border bg-background shadow-sm">
                        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={photo.url}
                            alt={photo.caption ? `${photo.caption} (Photo ${index + 1})` : `Item photo ${index + 1}`}
                            className="h-30 w-full object-cover transition duration-200 group-hover:scale-105"
                          />
                        </a>
                        {photo.caption ? (
                          <p className="px-3 pb-3 text-xs text-muted-foreground">{photo.caption}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {displayItemVideos.length > 0 && (
                <div>
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Videos</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {displayItemVideos.map((video: MediaAttachment, index: number) => (
                      <div key={`${video.url}-${index}`} className="space-y-2 overflow-hidden rounded-lg border bg-black/5 shadow-sm">
                        <video src={video.url} controls className="h-56 w-full object-cover" />
                        {video.caption ? (
                          <p className="px-3 pb-3 text-xs text-muted-foreground">{video.caption}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Location view: show all subtasks and remarks per sub-location */}
      {locations.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Locations</h2>
              <p className="text-sm text-muted-foreground">Tasks, conditions and remarks grouped by sub-location.</p>
            </div>
            <Badge variant="outline">{locations.length} location(s)</Badge>
          </div>

          <div className="space-y-4">
            {locations.map((loc: any) => {
              const group = locGroups.get(loc.id)
              const locTasks = group?.tasks || []
              const locEntries = group?.entries || []
              return (
                <Card key={loc.id} className="border border-slate-200/80 bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{loc.name || 'Location'}</CardTitle>
                    <CardDescription>Subtasks and remarks for this location</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Tasks & conditions */}
                    <div className="space-y-2">
                      <p className="text-xs uppercase text-muted-foreground">Subtasks</p>
                      {locTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No subtasks under this location.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {locTasks.map((t: any) => (
                            <div key={t.id} className="rounded border bg-accent/40 px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate" title={t.name || 'Subtask'}>{t.name || 'Subtask'}</span>
                                <Badge variant={t.status === 'COMPLETED' ? 'success' : 'secondary'} className="shrink-0">{t.status}</Badge>
                              </div>
                              {t.condition ? (
                                <p className="mt-1 text-xs text-muted-foreground">Condition: {t.condition}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Remarks in this location */}
                    <div className="space-y-2">
                      <p className="text-xs uppercase text-muted-foreground">Remarks</p>
                      {locEntries.length === 0 ? (
                        <div className="rounded-md border border-dashed bg-muted/40 py-4 text-center text-sm text-muted-foreground">
                          No remarks recorded for this location yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {locEntries.map((entry: any) => {
                            const reporter = entry.inspector?.name || entry.user?.username || entry.user?.email || 'Team member'
                            const remarkPhotos = mergeMediaLists([
                              extractEntryMedia(entry, 'PHOTO'),
                              stringsToAttachmentsWithTask(entry.task?.photos, entry.task?.id)
                            ])
                            const remarkVideos = mergeMediaLists([
                              extractEntryMedia(entry, 'VIDEO'),
                              stringsToAttachmentsWithTask(entry.task?.videos, entry.task?.id)
                            ])
                            return (
                              <div key={entry.id} className="rounded-lg border bg-white/80 p-4 shadow-sm">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <User className="h-4 w-4" />
                                    {reporter}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    {entry.condition ? <Badge variant="secondary">Condition: {entry.condition}</Badge> : null}
                                    <span className="text-muted-foreground">{formatDateTime(entry.createdOn)}</span>
                                  </div>
                                </div>
                                {entry.remarks ? (
                                  <p className="mt-2 text-sm text-muted-foreground">{entry.remarks}</p>
                                ) : null}
                                {(remarkPhotos.length > 0 || remarkVideos.length > 0) && (
                                  <div className="mt-3 space-y-2">
                                    {remarkPhotos.length > 0 && (
                                      <div>
                                        <p className="text-xs uppercase text-muted-foreground">Photos</p>
                                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                                          {remarkPhotos.map((photo: MediaAttachment, idx: number) => (
                                            <div key={photo.url + idx} className="space-y-1">
                                              <a href={photo.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-md border bg-background">
                                                <img src={photo.url} alt={buildCaption(photo) || `Remark photo ${idx + 1}`} className="h-30 w-full object-cover transition duration-200 group-hover:scale-105" />
                                              </a>
                                              {(() => { const c = buildCaption(photo); return c ? (<p className="text-[11px] text-muted-foreground">{c}</p>) : null })()}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {remarkVideos.length > 0 && (
                                      <div>
                                        <p className="text-xs uppercase text-muted-foreground">Videos</p>
                                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                          {remarkVideos.map((video: MediaAttachment, idx: number) => (
                                            <div key={video.url + idx} className="space-y-1">
                                              <video src={video.url} controls className="h-48 w-full rounded-md border bg-black/70" />
                                              {(() => { const c = buildCaption(video); return c ? (<p className="text-[11px] text-muted-foreground">{c}</p>) : null })()}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Cause / Resolution per finding */}
                    {locEntries.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="text-xs uppercase text-muted-foreground">Findings</p>
                        <div className="space-y-2">
                          {locEntries.map((entry: any) => {
                            const fList = Array.isArray(entry.findings) ? entry.findings : []
                            if (fList.length === 0) return null
                            return (
                              <div key={'f-' + entry.id} className="rounded-md border bg-white/70 p-3">
                                <p className="text-xs text-muted-foreground">Entry by {entry.inspector?.name || entry.user?.username || 'Team'}</p>
                                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                                  {fList.map((f: any, i: number) => {
                                    const tid = f.taskId as string | undefined
                                    const details = (f.details || {}) as any
                                    const idx = tid && taskIndexById.has(tid) ? (itemNumber ? `${taskIndexById.get(tid)!.loc}.${itemNumber}.${taskIndexById.get(tid)!.idx}` : `${taskIndexById.get(tid)!.loc}.${taskIndexById.get(tid)!.idx}`) : null
                                    const tname = tid ? (taskIndexById.get(tid)?.name || 'Subtask') : 'Subtask'
                                    const cond = typeof details.condition === 'string' ? details.condition : null
                                    const cause = typeof details.cause === 'string' && details.cause.trim().length > 0 ? details.cause : null
                                    const resolution = typeof details.resolution === 'string' && details.resolution.trim().length > 0 ? details.resolution : null
                                    return (
                                      <div key={i} className="rounded border bg-accent/30 px-3 py-2 text-sm">
                                        <p className="font-medium">{idx ? `${idx} ${tname}` : tname} {cond ? (<span className="ml-1 text-xs text-muted-foreground">({cond})</span>) : null}</p>
                                        {(cause || resolution) ? (
                                          <div className="mt-1 text-xs text-muted-foreground space-y-1">
                                            {cause ? (<p>Cause: {cause}</p>) : null}
                                            {resolution ? (<p>Resolution: {resolution}</p>) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )} 
    </div>
  )
}
