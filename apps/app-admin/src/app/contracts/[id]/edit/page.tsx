"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Save } from "lucide-react"

interface Contract {
  id: string
  customerId: string
  addressId: string
  value: string
  firstPaymentOn: string
  finalPaymentOn?: string
  scheduledStartDate: string
  scheduledEndDate: string
  actualStartDate?: string
  actualEndDate?: string
  servicePackage?: string
  remarks?: string
  status: string
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

export default function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [contractId, setContractId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [value, setValue] = useState("")
  const [servicePackage, setServicePackage] = useState("")
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [actualStartDate, setActualStartDate] = useState("")
  const [actualEndDate, setActualEndDate] = useState("")
  const [firstPaymentOn, setFirstPaymentOn] = useState("")
  const [finalPaymentOn, setFinalPaymentOn] = useState("")
  const [status, setStatus] = useState("DRAFT")
  const [remarks, setRemarks] = useState("")
  
  // Read-only customer and address info
  const [customer, setCustomer] = useState<Contract['customer'] | null>(null)
  const [address, setAddress] = useState<Contract['address'] | null>(null)

  useEffect(() => {
    const loadContract = async () => {
      const resolvedParams = await params
      setContractId(resolvedParams.id)
      await fetchContract(resolvedParams.id)
    }
    loadContract()
  }, [params])

  const fetchContract = async (id: string) => {
    try {
      const response = await fetch(`/api/contracts/${id}`)
      if (!response.ok) throw new Error("Failed to fetch contract")
      
      const contract: Contract = await response.json()
      
      setValue(contract.value.toString())
      setServicePackage(contract.servicePackage || "")
      setScheduledStartDate(contract.scheduledStartDate.split('T')[0])
      setScheduledEndDate(contract.scheduledEndDate.split('T')[0])
      setActualStartDate(contract.actualStartDate ? contract.actualStartDate.split('T')[0] : "")
      setActualEndDate(contract.actualEndDate ? contract.actualEndDate.split('T')[0] : "")
      setFirstPaymentOn(contract.firstPaymentOn.split('T')[0])
      setFinalPaymentOn(contract.finalPaymentOn ? contract.finalPaymentOn.split('T')[0] : "")
      setStatus(contract.status)
      setRemarks(contract.remarks || "")
      setCustomer(contract.customer)
      setAddress(contract.address)
      
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract")
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contractId) return
    
    setError("")
    setSaving(true)

    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: parseFloat(value),
          servicePackage,
          scheduledStartDate,
          scheduledEndDate,
          actualStartDate: actualStartDate || null,
          actualEndDate: actualEndDate || null,
          firstPaymentOn,
          finalPaymentOn: finalPaymentOn || null,
          status,
          remarks
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update contract")
      }

      router.push(`/contracts/${contractId}`)
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
        <Link href={contractId ? `/contracts/${contractId}` : "/contracts"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Contract</h1>
          <p className="text-muted-foreground mt-1">Update contract information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Contract Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contract Information</CardTitle>
                <CardDescription>Update the contract details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                {/* Customer and Address (Read-only) */}
                <div className="border rounded-lg p-4 bg-accent/50">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Customer</Label>
                      <p className="font-medium">{customer?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {customer?.email} • {customer?.phone}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Property Address</Label>
                      <p className="font-medium">{address?.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {address?.postalCode} • {address?.propertyType} • {address?.propertySize.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="value">Contract Value (SGD) *</Label>
                    <Input
                      id="value"
                      type="number"
                      step="0.01"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="servicePackage">Service Package</Label>
                    <Input
                      id="servicePackage"
                      value={servicePackage}
                      onChange={(e) => setServicePackage(e.target.value)}
                      placeholder="e.g., Premium Inspection"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status *</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                        <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
                    <Input
                      id="scheduledStartDate"
                      type="date"
                      value={scheduledStartDate}
                      onChange={(e) => setScheduledStartDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledEndDate">Scheduled End Date *</Label>
                    <Input
                      id="scheduledEndDate"
                      type="date"
                      value={scheduledEndDate}
                      onChange={(e) => setScheduledEndDate(e.target.value)}
                      min={scheduledStartDate}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualStartDate">Actual Start Date</Label>
                    <Input
                      id="actualStartDate"
                      type="date"
                      value={actualStartDate}
                      onChange={(e) => setActualStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="actualEndDate">Actual End Date</Label>
                    <Input
                      id="actualEndDate"
                      type="date"
                      value={actualEndDate}
                      onChange={(e) => setActualEndDate(e.target.value)}
                      min={actualStartDate}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="firstPaymentOn">First Payment Due *</Label>
                    <Input
                      id="firstPaymentOn"
                      type="date"
                      value={firstPaymentOn}
                      onChange={(e) => setFirstPaymentOn(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="finalPaymentOn">Final Payment Due</Label>
                    <Input
                      id="finalPaymentOn"
                      type="date"
                      value={finalPaymentOn}
                      onChange={(e) => setFinalPaymentOn(e.target.value)}
                      min={firstPaymentOn}
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
                    placeholder="Optional notes about this contract"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contract Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Contract Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Contract ID</p>
                  <p className="font-mono text-sm">#{contractId?.slice(-8).toUpperCase()}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Current Status</p>
                  <Badge variant={
                    status === 'DRAFT' ? 'outline' :
                    status === 'CONFIRMED' ? 'secondary' :
                    status === 'SCHEDULED' ? 'default' :
                    status === 'COMPLETED' ? 'success' :
                    status === 'CANCELLED' ? 'destructive' :
                    'default'
                  }>
                    {status}
                  </Badge>
                </div>

                {value && (
                  <div>
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold">
                      SGD {parseFloat(value).toFixed(2)}
                    </p>
                  </div>
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
                  <Link href={contractId ? `/contracts/${contractId}` : "/contracts"} className="block">
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
                  <li>• <strong>Draft:</strong> Initial contract creation</li>
                  <li>• <strong>Confirmed:</strong> Customer confirmed</li>
                  <li>• <strong>Scheduled:</strong> Work orders created</li>
                  <li>• <strong>Completed:</strong> All work done</li>
                  <li>• <strong>Closed:</strong> Payment received</li>
                  <li>• <strong>Cancelled:</strong> Contract cancelled</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}