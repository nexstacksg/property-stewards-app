"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Loader2, Search, User, MapPin, Calendar, Clock, AlertCircle } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"

interface Contract {
  id: string
  status: string
  value: string
  scheduledStartDate: string
  scheduledEndDate: string
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

interface Inspector {
  id: string
  name: string
  mobilePhone: string
  type: string
  specialization: string[]
  status: string
}

function NewWorkOrderPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedContractId = searchParams.get('contractId')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Contract selection
  const [contracts, setContracts] = useState<Contract[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searching, setSearching] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  
  // Inspector selection
  const [inspectors, setInspectors] = useState<Inspector[]>([])
  const [selectedInspectorId, setSelectedInspectorId] = useState("")
  const [loadingInspectors, setLoadingInspectors] = useState(true)
  const [inspectorWorkOrders, setInspectorWorkOrders] = useState<any[]>([])
  const [loadingInspectorJobs, setLoadingInspectorJobs] = useState(false)
  
  // Form fields
  const [scheduledStartDateTime, setScheduledStartDateTime] = useState("")
  const [scheduledStartTime, setScheduledStartTime] = useState("")
  const [scheduledEndDateTime, setScheduledEndDateTime] = useState("")
  const [scheduledEndTime, setScheduledEndTime] = useState("")
  const [remarks, setRemarks] = useState("")

  useEffect(() => {
    fetchInspectors()
    if (preselectedContractId) {
      fetchContract(preselectedContractId)
    } else {
      // Automatically load confirmed contracts
      loadAvailableContracts()
    }
  }, [preselectedContractId])

  useEffect(() => {
    if (selectedInspectorId) {
      fetchInspectorWorkOrders(selectedInspectorId)
    } else {
      setInspectorWorkOrders([])
    }
  }, [selectedInspectorId])

  const fetchInspectorWorkOrders = async (inspectorId: string) => {
    setLoadingInspectorJobs(true)
    try {
      const response = await fetch(`/api/work-orders?inspectorId=${inspectorId}&status=SCHEDULED,STARTED&limit=10`)
      if (response.ok) {
        const data = await response.json()
        setInspectorWorkOrders(data.workOrders || [])
      }
    } catch (err) {
      console.error('Error fetching inspector work orders:', err)
    } finally {
      setLoadingInspectorJobs(false)
    }
  }

  const fetchInspectors = async () => {
    try {
      setLoadingInspectors(true)
      const response = await fetch('/api/inspectors?status=ACTIVE&limit=100')
      if (!response.ok) throw new Error("Failed to fetch inspectors")
      
      const data = await response.json()
      setInspectors(data.inspectors || [])
    } catch (err) {
      console.error('Error fetching inspectors:', err)
      setInspectors([])
    } finally {
      setLoadingInspectors(false)
    }
  }

  const fetchContract = async (contractId: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}`)
      if (!response.ok) throw new Error("Failed to fetch contract")
      
      const contract: Contract = await response.json()
      setSelectedContract(contract)
      
      // Set default dates based on contract schedule
      const startDate = new Date(contract.scheduledStartDate)
      setScheduledStartDateTime(startDate.toISOString().split('T')[0])
      setScheduledStartTime('09:00')
      setScheduledEndDateTime(startDate.toISOString().split('T')[0])
      setScheduledEndTime('17:00')
    } catch (err) {
      console.error('Error fetching contract:', err)
    }
  }

  const loadAvailableContracts = async () => {
    setSearching(true)
    try {
      const response = await fetch(`/api/contracts?status=CONFIRMED&limit=20`)
      if (!response.ok) throw new Error("Failed to load contracts")
      
      const data = await response.json()
      setContracts(data.contracts || [])
    } catch (err) {
      console.error('Error loading contracts:', err)
    } finally {
      setSearching(false)
    }
  }

  const searchContracts = async () => {
    if (!searchTerm) {
      // If search is cleared, reload available contracts
      loadAvailableContracts()
      return
    }
    
    setSearching(true)
    try {
      const response = await fetch(`/api/contracts?search=${encodeURIComponent(searchTerm)}&status=CONFIRMED,SCHEDULED&limit=10`)
      if (!response.ok) throw new Error("Failed to search contracts")
      
      const data = await response.json()
      setContracts(data.contracts)
    } catch (err) {
      console.error('Error searching contracts:', err)
    } finally {
      setSearching(false)
    }
  }

  const selectContract = (contract: Contract) => {
    setSelectedContract(contract)
    setContracts([])
    setSearchTerm("")
    
    // Set default dates based on contract schedule
    const startDate = new Date(contract.scheduledStartDate)
    setScheduledStartDateTime(startDate.toISOString().split('T')[0])
    setScheduledStartTime('09:00')
    setScheduledEndDateTime(startDate.toISOString().split('T')[0])
    setScheduledEndTime('17:00')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedContract || !selectedInspectorId) {
      setError("Please select a contract and inspector")
      return
    }
    
    setError("")
    setLoading(true)

    try {
      // Combine date and time
      const startDateTime = new Date(`${scheduledStartDateTime}T${scheduledStartTime}:00`)
      const endDateTime = new Date(`${scheduledEndDateTime}T${scheduledEndTime}:00`)

      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: selectedContract.id,
          inspectorId: selectedInspectorId,
          scheduledStartDateTime: startDateTime.toISOString(),
          scheduledEndDateTime: endDateTime.toISOString(),
          remarks
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create work order")
      }

      const workOrder = await response.json()
      router.push(`/work-orders/${workOrder.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/work-orders">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Work Order</h1>
          <p className="text-muted-foreground mt-1">Create a new inspection work order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Work Order Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Information</CardTitle>
                <CardDescription>Enter the work order details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                {/* Contract Selection */}
                {!selectedContract ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Contract *</Label>
                      <div className="flex gap-2">
                        <Input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchContracts())}
                          placeholder="Search by customer name or contract ID"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={searchContracts}
                          disabled={searching}
                        >
                          {searching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Showing contracts with CONFIRMED status that need work orders
                      </p>
                    </div>

                    {searching && contracts.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                        Loading available contracts...
                      </div>
                    ) : contracts.length > 0 ? (
                      <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                        {contracts.map((contract) => (
                          <div
                            key={contract.id}
                            className="p-3 hover:bg-accent cursor-pointer"
                            onClick={() => selectContract(contract)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">
                                  Contract #{contract.id.slice(-8).toUpperCase()}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {contract.customer.name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {contract.address.address}, {contract.address.postalCode}
                                </p>
                              </div>
                              <Badge variant={
                                contract.status === 'CONFIRMED' ? 'secondary' :
                                contract.status === 'SCHEDULED' ? 'default' :
                                'outline'
                              }>
                                {contract.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No contracts available for work orders. 
                        <br />
                        <span className="text-xs">Contracts must be in CONFIRMED status to create work orders.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Selected Contract */}
                    <div className="border rounded-lg p-4 bg-accent/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <Label className="text-xs">Selected Contract</Label>
                          <p className="font-medium">
                            Contract #{selectedContract.id.slice(-8).toUpperCase()}
                          </p>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-3 w-3" />
                              <span>{selectedContract.customer.name}</span>
                            </div>
                            <div className="flex items-start gap-2 text-sm">
                              <MapPin className="h-3 w-3 mt-0.5" />
                              <span>
                                {selectedContract.address.address}, {selectedContract.address.postalCode}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedContract(null)
                            setScheduledStartDateTime("")
                            setScheduledEndDateTime("")
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    </div>

                    {/* Inspector Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="inspector">Assign Inspector *</Label>
                      <Select value={selectedInspectorId} onValueChange={setSelectedInspectorId} required disabled={loadingInspectors}>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingInspectors ? "Loading inspectors..." : "Select inspector"} />
                        </SelectTrigger>
                        <SelectContent>
                          {loadingInspectors ? (
                            <SelectItem value="loading" disabled>Loading inspectors...</SelectItem>
                          ) : inspectors.length === 0 ? (
                            <SelectItem value="no-inspectors" disabled>No inspectors available</SelectItem>
                          ) : (
                            inspectors.map(inspector => (
                              <SelectItem key={inspector.id} value={inspector.id}>
                                {inspector.name} ({inspector.type})
                                {inspector.specialization && 
                                 inspector.specialization.includes(selectedContract.address.propertyType) && 
                                  <span className="ml-2 text-xs text-green-600">✓ Specialized</span>
                                }
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {selectedContract && (
                  <>
                    {/* Inspector's Existing Work Orders */}
                    {selectedInspectorId && inspectorWorkOrders.length > 0 && (
                      <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2 text-red-800">
                          <AlertCircle className="h-4 w-4" />
                          <p className="font-medium">Inspector's Schedule</p>
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-red-800">Date</TableHead>
                                <TableHead className="text-red-800">Time</TableHead>
                                <TableHead className="text-red-800">Customer</TableHead>
                                <TableHead className="text-red-800">Address</TableHead>
                                <TableHead className="text-red-800">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {inspectorWorkOrders.map((wo: any) => (
                                <TableRow key={wo.id} className="text-sm">
                                  <TableCell className="text-red-700">
                                    {new Date(wo.scheduledStartDateTime).toLocaleDateString('en-SG')}
                                  </TableCell>
                                  <TableCell className="text-red-700">
                                    {new Date(wo.scheduledStartDateTime).toLocaleTimeString('en-SG', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                    {' - '}
                                    {new Date(wo.scheduledEndDateTime).toLocaleTimeString('en-SG', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </TableCell>
                                  <TableCell className="text-red-700">
                                    {wo.contract.customer.name}
                                  </TableCell>
                                  <TableCell className="text-red-700">
                                    {wo.contract.address.address}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={wo.status === 'SCHEDULED' ? 'info' : 'warning'}>
                                      {wo.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
                        <DatePicker
                          value={scheduledStartDateTime}
                          onChange={(date) => setScheduledStartDateTime(date ? date.toISOString().split('T')[0] : '')}
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
                          value={scheduledEndDateTime}
                          onChange={(date) => setScheduledEndDateTime(date ? date.toISOString().split('T')[0] : '')}
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
                  </>
                )}
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
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="info">SCHEDULED</Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Work order will be created as scheduled
                  </p>
                </div>

                {selectedContract && (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Property Type</p>
                      <Badge variant="outline">
                        {selectedContract.address.propertyType}
                      </Badge>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Property Size</p>
                      <Badge variant="secondary">
                        {selectedContract.address.propertySize.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </>
                )}

                <div className="pt-4 space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || !selectedContract || !selectedInspectorId}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Work Order
                  </Button>
                  <Link href="/work-orders" className="block">
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Next Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="text-sm space-y-2 text-muted-foreground">
                  <li>1. Work order created as SCHEDULED</li>
                  <li>2. Inspector receives notification</li>
                  <li>3. Inspector starts inspection</li>
                  <li>4. Complete checklist items</li>
                  <li>5. Customer signs off</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function NewWorkOrderPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewWorkOrderPageContent />
    </Suspense>
  )
}