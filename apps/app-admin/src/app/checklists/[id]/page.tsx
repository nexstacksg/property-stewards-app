import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ArrowLeft, 
  Edit, 
  FileText,
  Copy,
  Plus,
  Calendar,
  Hash
} from "lucide-react"
import prisma from "@/lib/prisma"

async function getChecklist(id: string) {
  const checklist = await prisma.checklist.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { order: 'asc' },
        include: {
          tasks: {
            orderBy: { order: 'asc' }
          }
        }
      },
      contracts: {
        include: {
          customer: true
        },
        take: 5,
        orderBy: { createdOn: 'desc' }
      }
    } as any
  })

  if (!checklist) {
    notFound()
  }

  return checklist
}


function formatDate(date: Date | string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-SG', {
    dateStyle: 'medium'
  })
}

export default async function ChecklistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const checklist = await getChecklist(resolvedParams.id) as any



  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/checklists">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{checklist.name}</h1>
              <Badge variant={checklist.status === 'ACTIVE' ? 'success' : 'secondary'}>
                {checklist.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">Checklist Template Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/checklists/${checklist.id}/edit`}>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Template
            </Button>
          </Link>
          <Link href={`/checklists/new?from=${checklist.id}`}>
            <Button variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Checklist Information */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Template Name</p>
                <p className="font-medium">{checklist.name}</p>
              </div>

              {checklist.remarks && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-sm">{checklist.remarks}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">Property Type</p>
                <Badge variant="outline">{checklist.propertyType}</Badge>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Total Locations</p>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  <span className="font-medium">{checklist.items.length}</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Created On</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">{formatDate(checklist.createdOn)}</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="font-medium">{formatDate(checklist.updatedOn)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Usage Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Used in Contracts</p>
                <p className="text-2xl font-bold">{checklist.contracts.length}</p>
              </div>

              {checklist.contracts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Recent Contracts</p>
                  <div className="space-y-1">
                    {checklist.contracts.map((contract: any,index:any) => (
                      <Link
                        key={index}
                        href={`/contracts/${contract.id}`}
                        className="block text-sm text-primary hover:underline"
                      >
                        #{contract.id } - {contract.customer.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Checklist Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Checklist Locations</CardTitle>
                  <CardDescription>{checklist.items.length} inspection location(s)</CardDescription>
                </div>
                {/* <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button> */}
              </div>
            </CardHeader>
            <CardContent>
              {checklist.items.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No locations in this checklist</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checklist.items.map((item: any) => {
                      const taskNames = Array.isArray(item.tasks)
                        ? item.tasks
                            .map((task: any) => task?.name?.trim())
                            .filter((name: string | undefined): name is string => !!name && name.length > 0)
                        : []

                      const summaryText = taskNames.length > 0
                        ? taskNames.join(', ')
                        : 'No tasks configured'

                      const isRequired = item.isRequired ?? true
                      const status = item.status ?? checklist.status

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.order}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name || item.item}</p>
                              <p className="text-sm text-muted-foreground">
                                {summaryText}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isRequired ? 'default' : 'secondary'}>
                              {isRequired ? 'Required' : 'Optional'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>
                              {status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Item Categories */}
          {/* <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(checklist.items.map((item: any) => item.category))).map((category: any) => {
                  const count = checklist.items.filter((item: any) => item.category === category).length
                  return (
                    <Badge key={category} variant="secondary">
                      {category} ({count})
                    </Badge>
                  )
                })}
              </div>
            </CardContent>
          </Card> */}
        </div>
      </div>
    </div>
  )
}
