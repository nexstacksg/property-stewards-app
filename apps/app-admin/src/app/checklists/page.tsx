"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, ClipboardCheck, Home, Building, FileText, List } from "lucide-react"

interface ChecklistTask {
  id: string
  name: string
  actions: string[]
  order: number
}

interface ChecklistItem {
  id: string
  name: string
  order: number
  tasks: ChecklistTask[]
}

interface Checklist {
  id: string
  name: string
  propertyType: string
  remarks?: string
  status: string
  items: ChecklistItem[]
  _count: {
    contracts: number
  }
}

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChecklists()
  }, [])

  const fetchChecklists = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/checklists')
      const data = await response.json()
      setChecklists(data)
    } catch (error) {
      console.error('Error fetching checklists:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPropertyIcon = (type: string) => {
    switch (type) {
      case 'HDB':
        return <Home className="h-4 w-4" />
      case 'CONDO':
      case 'APARTMENT':
        return <Building className="h-4 w-4" />
      default:
        return <Home className="h-4 w-4" />
    }
  }

  const getPropertyTypeColor = (type: string): any => {
    switch (type) {
      case 'HDB':
        return 'info'
      case 'CONDO':
        return 'success'
      case 'EC':
        return 'warning'
      case 'APARTMENT':
        return 'secondary'
      case 'LANDED':
        return 'default'
      default:
        return 'outline'
    }
  }


  console.log('here',checklists)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Checklist Templates</h1>
          <p className="text-muted-foreground mt-2">Manage inspection checklist templates</p>
        </div>
        <Link href="/checklists/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checklists.length}</div>
            <p className="text-xs text-muted-foreground">
              Active templates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
              <List className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {checklists.reduce((sum, c) => sum + c.items.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Inspection locations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Most Used</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {checklists.length > 0 
                ? checklists.reduce((max, c) => 
                    c._count.contracts > max._count.contracts ? c : max
                  ).name.substring(0, 20)
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Popular template
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Contracts Using</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {checklists.reduce((sum, c) => sum + c._count.contracts, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total usage
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          <Card className="lg:col-span-2">
            <CardContent className="text-center py-8">Loading...</CardContent>
          </Card>
        ) : (
          checklists.map((checklist) => (
            <Card key={checklist.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {getPropertyIcon(checklist.propertyType)}
                      {checklist.name}
                    </CardTitle>
                    <CardDescription>
                      {checklist.remarks || `Standard checklist for ${checklist.propertyType} properties`}
                    </CardDescription>
                  </div>
                  <Badge variant={getPropertyTypeColor(checklist.propertyType)}>
                    {checklist.propertyType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Locations:</span>
                    <span className="font-medium">{checklist.items.length}</span>
                  </div>
                  
                  <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                    <div className="space-y-2">
                      {checklist.items.slice(0, 5).map((item, idx) => {
                        const taskNames = (item.tasks || [])
                          .map((task) => task?.name?.trim())
                          .filter((name): name is string => !!name && name.length > 0)
                        const summaryText = taskNames.length > 0
                          ? taskNames.join(', ')
                          : 'No tasks configured'

                        return (
                          <div key={item.id} className="text-sm">
                            <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                            <span className="font-medium">{item.name}</span>
                            <div className="text-xs text-muted-foreground ml-5">
                              {summaryText}
                            </div>
                          </div>
                        )
                      })}
                      {checklist.items.length > 5 && (
                        <div className="text-xs text-muted-foreground text-center pt-2">
                          ... and {checklist.items.length - 5} more locations
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <div className="text-sm text-muted-foreground">
                      Used in <span className="font-medium">{checklist._count.contracts}</span> contracts
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/checklists/${checklist.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                      <Link href={`/checklists/${checklist.id}/edit`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {!loading && checklists.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No checklist templates found. Create your first template to get started.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
