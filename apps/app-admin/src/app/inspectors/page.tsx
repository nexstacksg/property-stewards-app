"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Phone, User, Briefcase, Award, Calendar } from "lucide-react"

interface Inspector {
  id: string
  name: string
  mobilePhone: string
  type: string
  specialization: string[]
  remarks?: string
  status: string
  _count: {
    workOrders: number
  }
}

export default function InspectorsPage() {
  const [inspectors, setInspectors] = useState<Inspector[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")

  useEffect(() => {
    fetchInspectors()
  }, [searchTerm, typeFilter])

  const fetchInspectors = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (searchTerm) {
        params.append('search', searchTerm)
      }
      
      if (typeFilter) {
        params.append('type', typeFilter)
      }

      const response = await fetch(`/api/inspectors?${params}`)
      const data = await response.json()
      
      // Handle both old array format and new object format
      if (Array.isArray(data)) {
        setInspectors(data)
      } else if (data.inspectors) {
        setInspectors(data.inspectors)
      } else {
        setInspectors([])
      }
    } catch (error) {
      console.error('Error fetching inspectors:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    fetchInspectors()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Inspectors</h1>
          <p className="text-muted-foreground mt-2">Manage property inspection personnel</p>
        </div>
        <Link href="/inspectors/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Inspector
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Inspectors</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspectors.length}</div>
            <p className="text-xs text-muted-foreground">
              Active personnel
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Full Time</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectors.filter(i => i.type === 'FULL_TIME').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Full-time inspectors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Part Time</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectors.filter(i => i.type === 'PART_TIME').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Part-time inspectors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectors.reduce((sum, i) => sum + i._count.workOrders, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Completed inspections
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Inspector List</CardTitle>
              <CardDescription>View and manage all inspectors</CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="">All Types</option>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
              </select>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search inspectors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                />
                <Button type="submit" variant="outline">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile Phone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Work Orders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspectors.map((inspector) => (
                    <TableRow key={inspector.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {inspector.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {inspector.mobilePhone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={inspector.type === 'FULL_TIME' ? 'default' : 'outline'}>
                          {inspector.type === 'FULL_TIME' ? 'Full Time' : 'Part Time'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inspector.specialization.map((spec, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {spec}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{inspector._count.workOrders}</TableCell>
                      <TableCell>
                        <Badge variant={inspector.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {inspector.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Link href={`/inspectors/${inspector.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                          <Link href={`/inspectors/${inspector.id}/edit`}>
                            <Button variant="outline" size="sm">Edit</Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {inspectors.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No inspectors found
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}