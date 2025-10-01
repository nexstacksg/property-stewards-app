"use client"

import { useState, useEffect, Suspense, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { ContractSelection } from "./components/contract-selection"
import { InspectorMultiSelect } from "./components/inspector-multi-select"
import { InspectorSchedule } from "./components/inspector-schedule"
import { WorkOrderSummary } from "./components/work-order-summary"
import type { Contract, Inspector } from "./types"

const DEFAULT_SCHEDULE_START_TIME = "09:00"
const DEFAULT_SCHEDULE_END_TIME = "17:00"

const formatDateInput = (date: Date) => {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  const year = normalized.getFullYear()
  const month = String(normalized.getMonth() + 1).padStart(2, "0")
  const day = String(normalized.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getDayAfterTomorrowStart = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 2)
  return date
}

function NewWorkOrderPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedContractId = searchParams.get("contractId")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [contracts, setContracts] = useState<Contract[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searching, setSearching] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)

  const [inspectors, setInspectors] = useState<Inspector[]>([])
  const [selectedInspectorIds, setSelectedInspectorIds] = useState<string[]>([])
  const [loadingInspectors, setLoadingInspectors] = useState(true)
  const [inspectorWorkOrders, setInspectorWorkOrders] = useState<Record<string, any[]>>({})
  const [loadingInspectorJobs, setLoadingInspectorJobs] = useState(false)

  const defaultScheduleDate = useMemo(() => getDayAfterTomorrowStart(), [])

  const [scheduledStartDateTime, setScheduledStartDateTime] = useState("")
  const [scheduledStartTime, setScheduledStartTime] = useState("")
  const [scheduledEndDateTime, setScheduledEndDateTime] = useState("")
  const [scheduledEndTime, setScheduledEndTime] = useState("")
  const [remarks, setRemarks] = useState("")

  useEffect(() => {
    const formattedDefault = formatDateInput(defaultScheduleDate)
    setScheduledStartDateTime((previous) => previous || formattedDefault)
    setScheduledEndDateTime((previous) => previous || formattedDefault)
    setScheduledStartTime((previous) => previous || DEFAULT_SCHEDULE_START_TIME)
    setScheduledEndTime((previous) => previous || DEFAULT_SCHEDULE_END_TIME)
  }, [defaultScheduleDate])

  useEffect(() => {
    fetchInspectors()
    if (preselectedContractId) {
      fetchContract(preselectedContractId)
    } else {
      loadAvailableContracts()
    }
  }, [preselectedContractId])

  useEffect(() => {
    if (selectedInspectorIds.length > 0) {
      fetchSelectedInspectorsWorkOrders(selectedInspectorIds)
    } else {
      setInspectorWorkOrders({})
    }
  }, [selectedInspectorIds])

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchTerm) {
        searchContracts(searchTerm)
      } else {
        loadAvailableContracts()
      }
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [searchTerm])

  const fetchSelectedInspectorsWorkOrders = async (ids: string[]) => {
    setLoadingInspectorJobs(true)
    try {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/work-orders?inspectorId=${id}&status=SCHEDULED,STARTED&limit=10`)
          if (!response.ok) return [id, [] as any[]] as const
          const data = await response.json()
          return [id, data.workOrders || []] as const
        })
      )
      const map: Record<string, any[]> = {}
      for (const [id, orders] of entries) map[id] = orders
      setInspectorWorkOrders(map)
    } catch (err) {
      console.error("Error fetching inspectors' schedules:", err)
    } finally {
      setLoadingInspectorJobs(false)
    }
  }

  const fetchInspectors = async () => {
    try {
      setLoadingInspectors(true)
      const response = await fetch("/api/inspectors?status=ACTIVE&limit=100")
      if (!response.ok) throw new Error("Failed to fetch inspectors")

      const data = await response.json()
      setInspectors(data.inspectors || [])
    } catch (err) {
      console.error("Error fetching inspectors:", err)
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
    } catch (err) {
      console.error("Error fetching contract:", err)
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
      console.error("Error loading contracts:", err)
    } finally {
      setSearching(false)
    }
  }

  const searchContracts = async (term: string) => {
    if (!term) {
      loadAvailableContracts()
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/contracts?search=${encodeURIComponent(term)}&status=CONFIRMED,SCHEDULED&limit=10`)
      if (!response.ok) throw new Error("Failed to search contracts")

      const data = await response.json()
      setContracts(data.contracts)
    } catch (err) {
      console.error("Error searching contracts:", err)
    } finally {
      setSearching(false)
    }
  }

  const selectContract = (contract: Contract) => {
    setSelectedContract(contract)
    setContracts([])
    setSearchTerm("")
  }

  const resetContract = () => {
    setSelectedContract(null)
    setScheduledStartDateTime("")
    setScheduledEndDateTime("")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedContract || selectedInspectorIds.length === 0) {
      setError("Please select a contract and at least one inspector")
      return
    }

    setError("")
    setLoading(true)

    try {
      const startDateTime = new Date(`${scheduledStartDateTime}T${scheduledStartTime}:00`)
      const endDateTime = new Date(`${scheduledEndDateTime}T${scheduledEndTime}:00`)

      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: selectedContract.id,
          inspectorIds: selectedInspectorIds,
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

  const canSubmit = Boolean(selectedContract) && selectedInspectorIds.length > 0

  return (
    <div className="p-6 space-y-6">
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
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Information</CardTitle>
                <CardDescription>Enter the work order details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">{error}</div>}

                <ContractSelection
                  contracts={contracts}
                  selectedContract={selectedContract}
                  searchTerm={searchTerm}
                  searching={searching}
                  onSearchTermChange={setSearchTerm}
                  onSelectContract={selectContract}
                  onResetContract={resetContract}
                />

                {selectedContract && (
                  <>
                    <InspectorMultiSelect
                      inspectors={inspectors}
                      selectedInspectorIds={selectedInspectorIds}
                      loadingInspectors={loadingInspectors}
                      propertyType={selectedContract.address.propertyType}
                      onSelectionChange={setSelectedInspectorIds}
                    />

                    <InspectorSchedule
                      inspectors={inspectors}
                      selectedInspectorIds={selectedInspectorIds}
                      inspectorWorkOrders={inspectorWorkOrders}
                      loadingInspectorJobs={loadingInspectorJobs}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
                        <DatePicker
                          value={scheduledStartDateTime}
                          onChange={(date) => setScheduledStartDateTime(date ? date.toISOString().split("T")[0] : "")}
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
                          onChange={(event) => setScheduledStartTime(event.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="scheduledEndDate">Scheduled End Date *</Label>
                        <DatePicker
                          value={scheduledEndDateTime}
                          onChange={(date) => setScheduledEndDateTime(date ? date.toISOString().split("T")[0] : "")}
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
                          onChange={(event) => setScheduledEndTime(event.target.value)}
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
                        onChange={(event) => setRemarks(event.target.value)}
                        placeholder="Optional notes about this work order"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <WorkOrderSummary selectedContract={selectedContract} canSubmit={canSubmit} loading={loading} />
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
