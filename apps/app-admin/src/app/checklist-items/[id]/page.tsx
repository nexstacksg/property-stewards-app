import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import prisma from '@/lib/prisma'
import ItemEntriesDialog from '@/components/item-entries-dialog'
import { extractEntryMedia, mergeMediaLists, stringsToAttachments, type MediaAttachment } from '@/lib/media-utils'
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
  if (!value) return 'N/A'
  return new Date(value).toLocaleDateString('en-SG', { dateStyle: 'medium' })
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
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
            orderBy: { createdOn: 'asc' }
          }as any
        },
        orderBy: { createdOn: 'asc' }
      },
      locations: {
        include: {
          tasks: {
            include: {
              entries: {
                select: { id: true }
              }
            },
            orderBy: { createdOn: 'asc' }
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
          location: true
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

  const taskPhotoAttachments = mergeMediaLists(tasks.map((task: any) => stringsToAttachments(task.photos)))
  const taskVideoAttachments = mergeMediaLists(tasks.map((task: any) => stringsToAttachments(task.videos)))
  const entryPhotoAttachments = mergeMediaLists(allEntries.map((entry: any) => extractEntryMedia(entry, 'PHOTO')))
  const entryVideoAttachments = mergeMediaLists(allEntries.map((entry: any) => extractEntryMedia(entry, 'VIDEO')))
  const entryTaskPhotoAttachments = mergeMediaLists(allEntries.map((entry: any) => stringsToAttachments(entry.task?.photos)))
  const entryTaskVideoAttachments = mergeMediaLists(allEntries.map((entry: any) => stringsToAttachments(entry.task?.videos)))

  const combinedItemPhotos = mergeMediaLists([itemPhotos, taskPhotoAttachments, entryPhotoAttachments, entryTaskPhotoAttachments])
  const combinedItemVideos = mergeMediaLists([itemVideos, taskVideoAttachments, entryVideoAttachments, entryTaskVideoAttachments])

  const displayItemPhotos = combinedItemPhotos.length > 0 ? combinedItemPhotos : itemPhotos
  const displayItemVideos = combinedItemVideos.length > 0 ? combinedItemVideos : itemVideos

  const totalMedia = displayItemPhotos.length + displayItemVideos.length

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
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {displayItemPhotos.map((photo: MediaAttachment, index: number) => (
                      <div key={`${photo.url}-${index}`} className="group space-y-2 overflow-hidden rounded-lg border bg-background shadow-sm">
                        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={photo.url}
                            alt={photo.caption ? `${photo.caption} (Photo ${index + 1})` : `Item photo ${index + 1}`}
                            className="h-40 w-full object-cover transition duration-200 group-hover:scale-105"
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Subtasks</h2>
            <p className="text-sm text-muted-foreground">Detailed breakdown with remarks, photos, and videos.</p>
          </div>
          <Badge variant="outline">{tasks.length} total</Badge>
        </div>

        {tasks.length === 0 ? (
          <Card className="border-dashed bg-white/60">
            <CardContent className="py-10 text-center text-muted-foreground">
              No subtasks available for this checklist item yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {tasks.map((task: any) => {
              const entries = Array.isArray(task.entries) ? task.entries : []

              return (
                <Card key={task.id} className="border border-slate-200/80 bg-white shadow-sm">
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-lg font-semibold">{task.name || 'Subtask'}</CardTitle>
                      </div>
                      <CardDescription>
                        Created {formatDateTime(task.createdOn)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={task.status === 'COMPLETED' ? 'success' : 'secondary'}>
                        {task.status}
                      </Badge>
                      {task.condition && <Badge variant="outline">Condition: {task.condition}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {entries.length === 0 ? (
                      <div className="rounded-md border border-dashed bg-muted/40 py-4 text-center text-sm text-muted-foreground">
                        No remarks recorded for this subtask yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {entries.map((entry: any) => {
                          const reporter = entry.inspector?.name || entry.user?.username || entry.user?.email || 'Team member'
                          const remarkPhotos = mergeMediaLists([
                            extractEntryMedia(entry, 'PHOTO'),
                            stringsToAttachments(entry.task?.photos)
                          ])
                          const remarkVideos = mergeMediaLists([
                            extractEntryMedia(entry, 'VIDEO'),
                            stringsToAttachments(entry.task?.videos)
                          ])
                          return (
                            <div key={entry.id} className="rounded-lg border bg-white/80 p-4 shadow-sm">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <User className="h-4 w-4" />
                                  {reporter}
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  {entry.condition && <Badge variant="secondary">Condition: {(entry.condition)}</Badge>}
                                  <span className="text-muted-foreground">{formatDateTime(entry.createdOn)}</span>
                                </div>
                              </div>
                              {entry.remarks ? (
                                <p className="mt-2 text-sm text-muted-foreground">{entry.remarks}</p>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">No written remarks.</p>
                              )}
                              {(remarkPhotos.length > 0 || remarkVideos.length > 0) && (
                                <div className="mt-3 space-y-2">
                                  {remarkPhotos.length > 0 && (
                                    <div>
                                      <p className="text-xs uppercase text-muted-foreground">Photos</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {remarkPhotos.map((photo: MediaAttachment, index: number) => (
                                          <div key={`${photo.url}-${index}`} className="group w-36 space-y-2 overflow-hidden rounded-md border bg-background">
                                            <a
                                              href={photo.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block"
                                            >
                                              <img
                                                src={photo.url}
                                                alt={photo.caption ? `${photo.caption} (Remark photo ${index + 1})` : `Remark photo ${index + 1}`}
                                                className="h-28 w-full object-cover transition duration-200 group-hover:scale-105"
                                              />
                                            </a>
                                            {photo.caption ? (
                                              <p className="px-2 pb-2 text-[11px] text-muted-foreground">{photo.caption}</p>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {remarkVideos.length > 0 && (
                                    <div>
                                      <p className="text-xs uppercase text-muted-foreground">Videos</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {remarkVideos.map((video: MediaAttachment, index: number) => (
                                          <div key={`${video.url}-${index}`} className="space-y-2">
                                            <video src={video.url} controls className="h-32 w-48 rounded-md border bg-black/70" />
                                            {video.caption ? (
                                              <p className="text-[11px] text-muted-foreground">{video.caption}</p>
                                            ) : null}
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {standaloneEntries.length > 0 && (
        <section className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Additional Remarks</CardTitle>
              <CardDescription>Remarks attached directly to the checklist item.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
            {standaloneEntries.map((entry: any) => {
              const reporter = entry.inspector?.name || entry.user?.username || entry.user?.email || 'Team member'
                const remarkPhotos = Array.isArray(entry.photos) ? entry.photos : []
                const remarkVideos = Array.isArray(entry.videos) ? entry.videos : []
                return (
                  <div key={entry.id} className="rounded-lg border bg-white/80 p-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-4 w-4" />
                        {reporter}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {entry.includeInReport ? <Badge variant="outline">In report · {reporter}</Badge> : null}
                        <span className="text-muted-foreground">{formatDateTime(entry.createdOn)}</span>
                      </div>
                    </div>
                    {entry.remarks ? (
                      <p className="mt-2 text-sm text-muted-foreground">{entry.remarks}</p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No remarks provided.</p>
                    )}
                    {(remarkPhotos.length > 0 || remarkVideos.length > 0) && (
                      <div className="mt-3 space-y-2">
                        {remarkPhotos.length > 0 && (
                          <div>
                            <p className="text-xs uppercase text-muted-foreground">Photos</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {remarkPhotos.map((url: string, index: number) => (
                                <a
                                  key={url + index}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group block overflow-hidden rounded-md border bg-background"
                                >
                                  <img
                                    src={url}
                                    alt={`Remark photo ${index + 1}`}
                                    className="h-28 w-36 object-cover transition duration-200 group-hover:scale-105"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {remarkVideos.length > 0 && (
                          <div>
                            <p className="text-xs uppercase text-muted-foreground">Videos</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {remarkVideos.map((url: string, index: number) => (
                                <video key={url + index} src={url} controls className="h-32 w-48 rounded-md border bg-black/70" />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
