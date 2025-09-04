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
import { ArrowLeft, Loader2, Search } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"

interface Customer {
  id: string
  name: string
  type: string
  email: string
  phone: string
  addresses: Address[]
}

interface Address {
  id: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  status: string
}

function NewContractPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedCustomerId = searchParams.get('customerId')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  
  // Form fields
  const [addressId, setAddressId] = useState("")
  const [servicePackage, setServicePackage] = useState<string>("")
  const [value, setValue] = useState("")
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [firstPaymentOn, setFirstPaymentOn] = useState("")
  const [remarks, setRemarks] = useState("")

  useEffect(() => {
    if (preselectedCustomerId) {
      fetchCustomer(preselectedCustomerId)
    }
  }, [preselectedCustomerId])

  const fetchCustomer = async (customerId: string) => {
    try {
      const response = await fetch(`/api/customers/${customerId}`)
      if (!response.ok) throw new Error("Failed to fetch customer")
      
      const customer: Customer = await response.json()
      setSelectedCustomer(customer)
      
      // Select first active address if available
      const activeAddress = customer.addresses.find(addr => addr.status === 'ACTIVE')
      if (activeAddress) {
        setAddressId(activeAddress.id)
      }
    } catch (err) {
      console.error('Error fetching customer:', err)
    }
  }

  const searchCustomers = async () => {
    if (!searchTerm) return
    
    setSearching(true)
    try {
      const response = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}&limit=10`)
      if (!response.ok) throw new Error("Failed to search customers")
      
      const data = await response.json()
      setCustomers(data.customers)
    } catch (err) {
      console.error('Error searching customers:', err)
    } finally {
      setSearching(false)
    }
  }

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomers([])
    setSearchTerm("")
    
    // Select first active address if available
    const activeAddress = customer.addresses.find(addr => addr.status === 'ACTIVE')
    if (activeAddress) {
      setAddressId(activeAddress.id)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer || !addressId) {
      setError("Please select a customer and address")
      return
    }
    
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          addressId,
          servicePackage,
          value: parseFloat(value),
          scheduledStartDate,
          scheduledEndDate: scheduledEndDate || scheduledStartDate,
          firstPaymentOn: firstPaymentOn || scheduledStartDate,
          remarks
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create contract")
      }

      const contract = await response.json()
      router.push(`/contracts/${contract.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/contracts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Contract</h1>
          <p className="text-muted-foreground mt-1">Create a new inspection contract</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Contract Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contract Information</CardTitle>
                <CardDescription>Enter the contract details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                {/* Customer Selection */}
                {!selectedCustomer ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Search Customer *</Label>
                      <div className="flex gap-2">
                        <Input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchCustomers())}
                          placeholder="Search by name, email, or phone"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={searchCustomers}
                          disabled={searching || !searchTerm}
                        >
                          {searching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {customers.length > 0 && (
                      <div className="border rounded-lg divide-y">
                        {customers.map((customer) => (
                          <div
                            key={customer.id}
                            className="p-3 hover:bg-accent cursor-pointer"
                            onClick={() => selectCustomer(customer)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{customer.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {customer.email} • {customer.phone}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {customer.addresses.length} address(es)
                                </p>
                              </div>
                              <Badge variant="outline">{customer.type}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Selected Customer */}
                    <div className="border rounded-lg p-4 bg-accent/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <Label className="text-xs">Selected Customer</Label>
                          <p className="font-medium">{selectedCustomer.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedCustomer.email} • {selectedCustomer.phone}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCustomer(null)
                            setAddressId("")
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    </div>

                    {/* Address Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="address">Property Address *</Label>
                      <Select value={addressId} onValueChange={setAddressId} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property address" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedCustomer.addresses
                            .filter(addr => addr.status === 'ACTIVE')
                            .map(address => (
                              <SelectItem key={address.id} value={address.id}>
                                {address.address} - {address.postalCode} ({address.propertyType})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
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
                    <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
                    <DatePicker
                      value={scheduledStartDate}
                      onChange={(date) => setScheduledStartDate(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select start date"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledEndDate">Scheduled End Date</Label>
                    <DatePicker
                      value={scheduledEndDate}
                      onChange={(date) => setScheduledEndDate(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select end date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="firstPaymentOn">First Payment Due</Label>
                    <DatePicker
                      value={firstPaymentOn}
                      onChange={(date) => setFirstPaymentOn(date ? date.toISOString().split('T')[0] : '')}
                      placeholder="Select payment due date"
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
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline">DRAFT</Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Contract will be created as draft
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="secondary">Inspection</Badge>
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
                    disabled={loading || !selectedCustomer || !addressId}
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Contract
                  </Button>
                  <Link href="/contracts" className="block">
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
                  <li>1. Contract will be created as DRAFT</li>
                  <li>2. Add inspection checklists</li>
                  <li>3. Create work orders</li>
                  <li>4. Assign inspectors</li>
                  <li>5. Confirm contract to start</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function NewContractPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewContractPageContent />
    </Suspense>
  )
}