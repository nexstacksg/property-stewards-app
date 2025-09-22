import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import prisma from '@/lib/prisma'
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
              address: true
            }
          }
        }
      },
      checklistTasks: {
        include: {
          entries: {
            include: {
              inspector: { select: { id: true, name: true } }
            },
            orderBy: { createdOn: 'asc' }
          }
        },
        orderBy: { createdOn: 'asc' }
      },
      contributions: {
        include: {
          inspector: { select: { id: true, name: true } },
          task: {
            select: {
              id: true
            }
          }
        }
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
  const standaloneEntries = (Array.isArray(checklistItem.contributions) ? checklistItem.contributions : []).filter(
    (entry: any) => !entry.task
  )
  const itemPhotos = Array.isArray(checklistItem.photos) ? checklistItem.photos : []
  const itemVideos = Array.isArray(checklistItem.videos) ? checklistItem.videos : []

  const totalRemarks =
    tasks.reduce(
      (count: number, task: any) => count + (Array.isArray(task.entries) ? task.entries.length : 0),
      0
    ) + standaloneEntries.length

  const entryPhotoUrls = tasks.flatMap((task: any) =>
    Array.isArray(task.entries)
      ? task.entries.flatMap((entry: any) => (Array.isArray(entry.photos) ? entry.photos : []))
      : []
  )
  const entryVideoUrls = tasks.flatMap((task: any) =>
    Array.isArray(task.entries)
      ? task.entries.flatMap((entry: any) => (Array.isArray(entry.videos) ? entry.videos : []))
      : []
  )
  const standaloneEntryPhotoUrls = standaloneEntries.flatMap((entry: any) =>
    Array.isArray(entry.photos) ? entry.photos : []
  )
  const standaloneEntryVideoUrls = standaloneEntries.flatMap((entry: any) =>
    Array.isArray(entry.videos) ? entry.videos : []
  )

  const photoUrls = new Set<string>([...itemPhotos, ...entryPhotoUrls, ...standaloneEntryPhotoUrls])
  const videoUrls = new Set<string>([...itemVideos, ...entryVideoUrls, ...standaloneEntryVideoUrls])

  const totalMedia = photoUrls.size + videoUrls.size

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
                  <p className="text-muted-foreground">Remark</p>
                  <p className="font-medium">{checklistItem.remarks || 'N/A'}</p>
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

          {(itemPhotos.length > 0 || itemVideos.length > 0) && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Item Media</h3>
              {itemPhotos.length > 0 && (
                <div>
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Photos</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {itemPhotos.map((url: string, index: number) => (
                      <a key={url + index} href={url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-lg border bg-background shadow-sm">
                        <img src={url} alt={`Item photo ${index + 1}`} className="h-40 w-full object-cover transition duration-200 group-hover:scale-105" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {itemVideos.length > 0 && (
                <div>
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Videos</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {itemVideos.map((url: string, index: number) => (
                      <div key={url + index} className="overflow-hidden rounded-lg border bg-black/5 shadow-sm">
                        <video src={url} controls className="h-56 w-full object-cover" />
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
                          const reporter = entry.inspector?.name || 'Admin'
                          const remarkPhotos = Array.isArray(entry.photos) ? entry.photos : []
                          const remarkVideos = Array.isArray(entry.videos) ? entry.videos : []
                          return (
                            <div key={entry.id} className="rounded-lg border bg-white/80 p-4 shadow-sm">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <User className="h-4 w-4" />
                                  {entry.inspector?.name || 'Admin'}
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
                const reporter = entry.inspector?.name || 'Admin'
                const remarkPhotos = Array.isArray(entry.photos) ? entry.photos : []
                const remarkVideos = Array.isArray(entry.videos) ? entry.videos : []
                return (
                  <div key={entry.id} className="rounded-lg border bg-white/80 p-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-4 w-4" />
                        {entry.inspector?.name || 'Inspector'}
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
