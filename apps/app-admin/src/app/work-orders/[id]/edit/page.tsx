"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
// removed Select components in favor of checkboxes
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Save, User, MapPin } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"

interface WorkOrder {
  id: string
  contractId: string
  inspectors: Array<{ id: string; name: string; mobilePhone: string; type: string }>
  scheduledStartDateTime: string
  scheduledEndDateTime: string
  actualStart?: string
  actualEnd?: string
  status: string
  remarks?: string
  signOffBy?: string
  signature?: string
  contract: {
    id: string
    customer: {
      id: string
      name: string
      email: string
      phone: string
    }
    address: {
      id: string
      address: string
      postalCode: string
      propertyType: string
      propertySize: string
    }
  }
  // inspector field removed in multi-assign model
}

interface Inspector {
  id: string
  name: string
  mobilePhone: string
  type: string
  specialization: string[]
  status: string
}

export default function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [workOrderId, setWorkOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  
  // Inspectors list
  const [inspectors, setInspectors] = useState<Inspector[]>([])
  
  // Form fields
  const [inspectorIds, setInspectorIds] = useState<string[]>([])
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledStartTime, setScheduledStartTime] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [scheduledEndTime, setScheduledEndTime] = useState("")
  const [actualStartDate, setActualStartDate] = useState("")
  const [actualStartTime, setActualStartTime] = useState("")
  const [actualEndDate, setActualEndDate] = useState("")
  const [actualEndTime, setActualEndTime] = useState("")
  const [status, setStatus] = useState("SCHEDULED")
  const [remarks, setRemarks] = useState("")
  const [signOffBy, setSignOffBy] = useState("")
  
  // Read-only contract info
  const [contract, setContract] = useState<WorkOrder['contract'] | null>(null)
  
  // Inspector picker UI state
  const [inspectorPickerOpen, setInspectorPickerOpen] = useState(false)
  const [inspectorQuery, setInspectorQuery] = useState("")
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [triggerWidth, setTriggerWidth] = useState<number>(0)
  useEffect(() => {
    const update = () => setTriggerWidth(triggerRef.current?.offsetWidth || 0)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      const resolvedParams = await params
      setWorkOrderId(resolvedParams.id)
      await Promise.all([
        fetchWorkOrder(resolvedParams.id),
        fetchInspectors()
      ])
    }
    loadData()
  }, [params])

  const fetchWorkOrder = async (id: string) => {
    try {
      const response = await fetch(`/api/work-orders/${id}`)
      if (!response.ok) throw new Error("Failed to fetch work order")
      
      const workOrder: WorkOrder = await response.json()
      
      // Parse dates and times
      const scheduledStart = new Date(workOrder.scheduledStartDateTime)
      const scheduledEnd = new Date(workOrder.scheduledEndDateTime)
      
      setInspectorIds((workOrder.inspectors || []).map(i => i.id))
      setScheduledStartDate(scheduledStart.toISOString().split('T')[0])
      setScheduledStartTime(scheduledStart.toTimeString().slice(0, 5))
      setScheduledEndDate(scheduledEnd.toISOString().split('T')[0])
      setScheduledEndTime(scheduledEnd.toTimeString().slice(0, 5))
      
      if (workOrder.actualStart) {
        const actualStart = new Date(workOrder.actualStart)
        setActualStartDate(actualStart.toISOString().split('T')[0])
        setActualStartTime(actualStart.toTimeString().slice(0, 5))
      }
      
      if (workOrder.actualEnd) {
        const actualEnd = new Date(workOrder.actualEnd)
        setActualEndDate(actualEnd.toISOString().split('T')[0])
        setActualEndTime(actualEnd.toTimeString().slice(0, 5))
      }
      
      setStatus(workOrder.status)
      setRemarks(workOrder.remarks || "")
      setSignOffBy(workOrder.signOffBy || "")
      setContract(workOrder.contract)
      
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load work order")
      setLoading(false)
    }
  }

  const fetchInspectors = async () => {
    try {
      const response = await fetch('/api/inspectors?status=ACTIVE&limit=100')
      if (!response.ok) throw new Error("Failed to fetch inspectors")
      
      const data = await response.json()
      setInspectors(data.inspectors)
    } catch (err) {
      console.error('Error fetching inspectors:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workOrderId) return
    
    setError("")
    setSaving(true)

    try {
      // Combine dates and times
      const scheduledStartDateTime = new Date(`${scheduledStartDate}T${scheduledStartTime}:00`)
      const scheduledEndDateTime = new Date(`${scheduledEndDate}T${scheduledEndTime}:00`)
      
      let actualStart = null
      if (actualStartDate && actualStartTime) {
        actualStart = new Date(`${actualStartDate}T${actualStartTime}:00`).toISOString()
      }
      
      let actualEnd = null
      if (actualEndDate && actualEndTime) {
        actualEnd = new Date(`${actualEndDate}T${actualEndTime}:00`).toISOString()
      }

      const response = await fetch(`/api/work-orders/${workOrderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectorIds,
          scheduledStartDateTime: scheduledStartDateTime.toISOString(),
          scheduledEndDateTime: scheduledEndDateTime.toISOString(),
          actualStart,
          actualEnd,
          status,
          remarks,
          signOffBy: signOffBy || null
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update work order")
      }

      router.push(`/work-orders/${workOrderId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={workOrderId ? `/work-orders/${workOrderId}` : "/work-orders"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Work Order</h1>
          <p className="text-muted-foreground mt-1">Update work order information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Work Order Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Information</CardTitle>
                <CardDescription>Update the work order details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                {/* Contract Info (Read-only) */}
                <div className="border rounded-lg p-4 bg-accent/50">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Contract</Label>
                      <p className="font-medium">
                        #{contract?.id }
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Customer</Label>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3 w-3" />
                        <span>{contract?.customer.name}</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Property</Label>
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-3 w-3 mt-0.5" />
                        <span>
                          {contract?.address.address}, {contract?.address.postalCode}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Inspectors *</Label>
                    <Popover open={inspectorPickerOpen} onOpenChange={(o) => { setInspectorPickerOpen(o); if (o) setTriggerWidth(triggerRef.current?.offsetWidth || 0) }}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="w-full justify-between" ref={triggerRef}>
                          {(() => {
                            const selected = inspectors.filter(i => inspectorIds.includes(i.id))
                            if (inspectors.length === 0) return 'Loading inspectors...'
                            if (selected.length === 0) return 'Select inspectors'
                            const names = selected.map(s => s.name)
                            return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2} more` : '')
                          })()}
                          <span className="text-muted-foreground">▾</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} style={{ width: triggerWidth }} className="p-3">
                        <div className="space-y-3">
                          <div className="relative">
                            <Input
                              placeholder="Search by name or phone"
                              value={inspectorQuery}
                              onChange={(e) => setInspectorQuery(e.target.value)}
                              className="pr-8"
                            />
                            {/* simple icon mimic */}
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">⌕</span>
                          </div>
                          <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                            {inspectors.length === 0 ? (
                              <div className="p-3 text-sm text-muted-foreground">No inspectors available</div>
                            ) : (
                              inspectors
                                .filter(i => {
                                  const q = inspectorQuery.trim().toLowerCase()
                                  if (!q) return true
                                  return i.name.toLowerCase().includes(q) || i.mobilePhone.toLowerCase().includes(q)
                                })
                                .map((inspector) => {
                                  const checked = inspectorIds.includes(inspector.id)
                                  const specialized = inspector.specialization.includes(contract?.address.propertyType || '')
                                  return (
                                    <label key={inspector.id} className="flex items-center justify-between gap-3 p-3 cursor-pointer">
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4"
                                          checked={checked}
                                          onChange={(e) => {
                                            setInspectorIds((prev) => e.target.checked ? [...prev, inspector.id] : prev.filter(id => id !== inspector.id))
                                          }}
                                        />
                                        <div>
                                          <p className="text-sm font-medium">{inspector.name} <span className="text-xs text-muted-foreground">({inspector.type})</span></p>
                                          <p className="text-xs text-muted-foreground">{inspector.mobilePhone}</p>
                                        </div>
                                      </div>
                                      {specialized && (
                                        <span className="text-xs text-green-600">✓ Specialized</span>
                                      )}
                                    </label>
                                  )
                                })
                            )}
                          </div>
                          <div className="flex justify-between pt-1">
                            <Button type="button" variant="ghost" onClick={() => setInspectorIds([])}>Clear selection</Button>
                            <Button type="button" onClick={() => setInspectorPickerOpen(false)}>Apply</Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {inspectorIds.length === 0 && (
                      <p className="text-xs text-destructive">Select at least one inspector</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status *</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        <SelectItem value="STARTED">Started</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signOffBy">Signed Off By</Label>
                    <Input
                      id="signOffBy"
                      value={signOffBy}
                      onChange={(e) => setSignOffBy(e.target.value)}
                      placeholder="Name of person who signed off"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
                    <DatePicker
                      value={scheduledStartDate}
                      onChange={(date) => setScheduledStartDate(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select start date"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledStartTime">Start Time *</Label>
                    <Input
                      id="scheduledStartTime"
                      type="time"
                      value={scheduledStartTime}
                      onChange={(e) => setScheduledStartTime(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledEndDate">Scheduled End Date *</Label>
                    <DatePicker
                      value={scheduledEndDate}
                      onChange={(date) => setScheduledEndDate(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select end date"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledEndTime">End Time *</Label>
                    <Input
                      id="scheduledEndTime"
                      type="time"
                      value={scheduledEndTime}
                      onChange={(e) => setScheduledEndTime(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualStartDate">Actual Start Date</Label>
                    <DatePicker
                      value={actualStartDate}
                      onChange={(date) => setActualStartDate(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select actual start date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualStartTime">Actual Start Time</Label>
                    <Input
                      id="actualStartTime"
                      type="time"
                      value={actualStartTime}
                      onChange={(e) => setActualStartTime(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualEndDate">Actual End Date</Label>
                    <DatePicker
                      value={actualEndDate}
                      onChange={(date) => setActualEndDate(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select actual end date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualEndTime">Actual End Time</Label>
                    <Input
                      id="actualEndTime"
                      type="time"
                      value={actualEndTime}
                      onChange={(e) => setActualEndTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="remarks">Remarks</Label>
                  <textarea
                    id="remarks"
                    className="w-full min-h-[80px] px-3 py-2 border rounded-md"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional notes about this work order"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Work Order Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Work Order ID</p>
                  <p className="font-mono text-sm">#{workOrderId? }</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Current Status</p>
                  <Badge variant={
                    status === 'SCHEDULED' ? 'info' :
                    status === 'STARTED' ? 'warning' :
                    status === 'COMPLETED' ? 'success' :
                    status === 'CANCELLED' ? 'destructive' :
                    'default'
                  }>
                    {status}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Assigned Inspectors</p>
                  {inspectorIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <p className="text-sm">{inspectorIds.length} selected</p>
                  )}
                </div>

                {contract && (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Property Type</p>
                      <Badge variant="outline">
                        {contract.address.propertyType}
                      </Badge>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Property Size</p>
                      <Badge variant="secondary">
                        {contract.address.propertySize.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </>
                )}

                <div className="pt-4 space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Link href={workOrderId ? `/work-orders/${workOrderId}` : "/work-orders"} className="block">
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Status Guide</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• <strong>Scheduled:</strong> Waiting to start</li>
                  <li>• <strong>Started:</strong> Inspector on site</li>
                  <li>• <strong>Completed:</strong> Inspection done</li>
                  <li>• <strong>Cancelled:</strong> Work order cancelled</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
