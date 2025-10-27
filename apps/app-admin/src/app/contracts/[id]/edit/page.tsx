"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ContractEditForm } from "@/components/contracts/edit/contract-edit-form"
import { ContractEditSummary } from "@/components/contracts/edit/contract-edit-summary"
import { ContactPersonsCard } from "@/components/contracts/edit/contact-persons-card"
import { StatusGuideCard } from "@/components/contracts/edit/status-guide-card"
import { ChecklistLocationsEditor } from "@/components/contracts/edit/checklist-locations-editor"
import { InspectorRatingsCard } from "@/components/contracts/edit/inspector-ratings-card"
import {
  DEFAULT_CATEGORY,
  buildActionFromTasks,
  extractActionTasksFromItem,
  sanitiseTasks,
} from "@/components/contracts/edit/checklist-utils"
import { type InspectorRatingValue, type RatingSelectValue, ratingFromStars, starsFromRating } from "@/components/contracts/edit/ratings-utils"
import type {
  ChecklistDraftItem,
  ChecklistTemplate,
  ContractAddressSummary,
  ContractCustomerSummary,
  ContractReferenceOption,
  ContactPersonDraft,
  ContractStatus,
  ContractType,
  MarketingSourceOption,
  MarketingSourceSelectValue,
} from "@/components/contracts/types"

type ContractInspectorSummary = {
  id: string
  name: string
  mobilePhone?: string | null
}

interface ContractResponse {
  id: string
  customerId: string
  addressId: string
  value: string | number
  firstPaymentOn: string
  finalPaymentOn?: string | null
  scheduledStartDate: string
  scheduledEndDate: string
  actualStartDate?: string | null
  actualEndDate?: string | null
  servicePackage?: string | null
  contractType?: ContractType | null
  remarks?: string | null
  status: ContractStatus
  marketingSource?: { id: string; name: string } | null
  referenceIds?: string[]
  customer: ContractCustomerSummary
  address: ContractAddressSummary
  contactPersons?: Array<{
    id: string
    name: string
    phone?: string | null
    email?: string | null
    relation?: string | null
  }>
  basedOnChecklist?: {
    id: string
  }
  contractChecklist?: {
    items?: Array<{
      name: string
      remarks?: string | null
      order?: number | null
    }>
  }
  workOrders?: Array<{
    id: string
    inspectors?: ContractInspectorSummary[]
  }>
  inspectorRatings?: Array<{
    inspectorId: string
    rating: InspectorRatingValue
    inspector?: ContractInspectorSummary
  }>
}

export default function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [contractId, setContractId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [value, setValue] = useState("")
  const [servicePackage, setServicePackage] = useState("")
  const [contractType, setContractType] = useState<ContractType>("INSPECTION")
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [actualStartDate, setActualStartDate] = useState("")
  const [actualEndDate, setActualEndDate] = useState("")
  const [firstPaymentOn, setFirstPaymentOn] = useState("")
  const [finalPaymentOn, setFinalPaymentOn] = useState("")
  const [status, setStatus] = useState<ContractStatus>("DRAFT")
  const [remarks, setRemarks] = useState("")

  const [customer, setCustomer] = useState<ContractCustomerSummary | null>(null)
  const [address, setAddress] = useState<ContractAddressSummary | null>(null)

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([])

  const [availableReferences, setAvailableReferences] = useState<ContractReferenceOption[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [marketingSource, setMarketingSource] = useState<MarketingSourceSelectValue>("NONE")
  const [marketingSourceOptions, setMarketingSourceOptions] = useState<MarketingSourceOption[]>([])

  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([])
  const [contactEditIndex, setContactEditIndex] = useState<number | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactPersonDraft | null>(null)
  const [contactError, setContactError] = useState("")

  const [contractInspectors, setContractInspectors] = useState<ContractInspectorSummary[]>([])
  const [inspectorRatingsState, setInspectorRatingsState] = useState<Record<string, InspectorRatingValue | null>>({})
  const [ratingSavingState, setRatingSavingState] = useState<Record<string, boolean>>({})
  const [ratingError, setRatingError] = useState<string | null>(null)

  useEffect(() => {
    const loadContract = async () => {
      const resolvedParams = await params
      setContractId(resolvedParams.id)
      await fetchContract(resolvedParams.id)
    }
    loadContract()
    // load marketing sources
    ;(async () => {
      try {
        const res = await fetch('/api/marketing-sources')
        const data = await res.json().catch(() => ({}))
        setMarketingSourceOptions(Array.isArray(data.sources) ? data.sources : [])
      } catch {
        setMarketingSourceOptions([])
      }
    })()
  }, [params])

  const fetchContract = async (id: string) => {
    try {
      const response = await fetch(`/api/contracts/${id}`)
      if (!response.ok) throw new Error("Failed to fetch contract")

      const contract: ContractResponse = await response.json()

      setValue(contract.value.toString())
      setServicePackage(contract.servicePackage || "")
      setContractType(contract.contractType || "INSPECTION")
      setScheduledStartDate(contract.scheduledStartDate.split("T")[0])
      setScheduledEndDate(contract.scheduledEndDate.split("T")[0])
      setActualStartDate(contract.actualStartDate ? contract.actualStartDate.split("T")[0] : "")
      setActualEndDate(contract.actualEndDate ? contract.actualEndDate.split("T")[0] : "")
      setFirstPaymentOn(contract.firstPaymentOn.split("T")[0])
      setFinalPaymentOn(contract.finalPaymentOn ? contract.finalPaymentOn.split("T")[0] : "")
      setStatus(contract.status)
      setRemarks(contract.remarks || "")
      setCustomer(contract.customer)
      setAddress(contract.address)
      setMarketingSource(contract.marketingSource?.id || "NONE")
      setSelectedReferenceIds(Array.isArray(contract.referenceIds) ? contract.referenceIds : [])
      setContactPersons(
        Array.isArray(contract.contactPersons)
          ? contract.contactPersons.map((person) => ({
              id: person.id,
              name: person.name || "",
              phone: person.phone || "",
              email: person.email || "",
              relation: person.relation || "",
            }))
          : [],
      )
      setContactEditIndex(null)
      setContactDraft(null)
      setContactError("")

      const inspectorMap = new Map<string, ContractInspectorSummary>()

      if (Array.isArray(contract.workOrders)) {
        contract.workOrders.forEach((workOrder) => {
          if (!workOrder || !Array.isArray(workOrder.inspectors)) return
          workOrder.inspectors.forEach((inspector) => {
            if (!inspector || typeof inspector.id !== 'string') return
            if (!inspectorMap.has(inspector.id)) {
              inspectorMap.set(inspector.id, {
                id: inspector.id,
                name: inspector.name || 'Inspector',
                mobilePhone: inspector.mobilePhone || null,
              })
            }
          })
        })
      }

      const ratingMap: Record<string, InspectorRatingValue | null> = {}

      if (Array.isArray(contract.inspectorRatings)) {
        contract.inspectorRatings.forEach((entry: any) => {
          if (!entry || typeof entry.inspectorId !== 'string') return
          if (entry.inspector && !inspectorMap.has(entry.inspector.id)) {
            inspectorMap.set(entry.inspector.id, {
              id: entry.inspector.id,
              name: entry.inspector.name || 'Inspector',
              mobilePhone: entry.inspector.mobilePhone || null,
            })
          }
          if (entry.rating) {
            const stars = starsFromRating(entry.rating as any)
            if (stars > 0) ratingMap[entry.inspectorId] = stars as InspectorRatingValue
          }
        })
      } else if (contract && typeof (contract as any).inspectorRatings === 'object' && (contract as any).inspectorRatings !== null) {
        const map = (contract as any).inspectorRatings as Record<string, any>
        for (const [inspectorId, rating] of Object.entries(map)) {
          const stars = starsFromRating(rating as any)
          if (stars > 0) ratingMap[inspectorId] = stars as InspectorRatingValue
        }
      }

      setContractInspectors(Array.from(inspectorMap.values()))
      setInspectorRatingsState(ratingMap)
      setRatingSavingState({})
      setRatingError(null)

      fetchTemplates()
      fetchCustomerContracts(contract.customerId, contract.id)

      try {
        const basedOnId = contract.basedOnChecklist?.id
        if (basedOnId) setSelectedTemplateId(basedOnId)
        else setSelectedTemplateId("")
        const checklist = contract.contractChecklist
        if (checklist && Array.isArray(checklist.items)) {
          const items = checklist.items
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((item, index) => {
              const tasks = extractActionTasksFromItem(item)
              return {
                item: item.name,
                description: tasks.length > 0 ? buildActionFromTasks(tasks) : item.remarks || "",
                order: item.order ?? index + 1,
                isRequired: true,
                category: DEFAULT_CATEGORY,
                tasks,
              }
            })
          setChecklistItems(items)
        } else {
          setChecklistItems([])
        }
      } catch {
        setChecklistItems([])
      }

      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract")
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/checklist-templates`)
      if (!res.ok) {
        setTemplates([])
        return
      }
      const data = await res.json()
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch {
      setTemplates([])
    }
  }

  const fetchCustomerContracts = async (customerId: string, excludeId?: string) => {
    try {
      const res = await fetch(`/api/contracts?customerId=${customerId}&limit=100`)
      if (!res.ok) {
        setAvailableReferences([])
        return
      }
      const data = await res.json()
      const options: ContractReferenceOption[] = Array.isArray(data.contracts)
        ? data.contracts
            .filter(
              (contract: any) => contract && typeof contract.id === "string" && contract.id !== excludeId,
            )
            .map((contract: any) => ({
              id: contract.id,
              label: `#${contract.id } • ${contract.status}`,
              status: contract.status,
              address: contract.address?.address ?? null,
              postalCode: contract.address?.postalCode ?? null,
              scheduledStartDate: contract.scheduledStartDate ?? null,
              scheduledEndDate: contract.scheduledEndDate ?? null,
              value: typeof contract.value === 'number' ? contract.value : Number(contract.value ?? 0),
              workOrderCount: Array.isArray(contract.workOrders) ? contract.workOrders.length : 0,
            }))
        : []
      setAvailableReferences(options)
    } catch {
      setAvailableReferences([])
    }
  }

  const handleInspectorRatingChange = async (inspectorId: string, value: RatingSelectValue) => {
    if (!contractId) return
    const previousValue = inspectorRatingsState[inspectorId] ?? null
    const nextRating = value === 'NONE' ? null : (value as InspectorRatingValue)

    setRatingError(null)
    setInspectorRatingsState((prev) => {
      const next = { ...prev }
      if (nextRating) {
        next[inspectorId] = nextRating
      } else {
        delete next[inspectorId]
      }
      return next
    })
    setRatingSavingState((prev) => ({ ...prev, [inspectorId]: true }))

    try {
      const response = await fetch(`/api/contracts/${contractId}/ratings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectorId, rating: value === 'NONE' ? null : value }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update rating')
      }

      setInspectorRatingsState((prev) => {
        const next = { ...prev }
        if (data?.rating) {
          next[inspectorId] = data.rating as InspectorRatingValue
        } else {
          delete next[inspectorId]
        }
        return next
      })
    } catch (error) {
      console.error('Rating update failed', error)
      setInspectorRatingsState((prev) => {
        const next = { ...prev }
        if (previousValue) {
          next[inspectorId] = previousValue
        } else {
          delete next[inspectorId]
        }
        return next
      })
      setRatingError((error as Error).message)
    } finally {
      setRatingSavingState((prev) => {
        const next = { ...prev }
        delete next[inspectorId]
        return next
      })
    }
  }

  const beginAddContactPerson = () => {
    if (contactEditIndex !== null) {
      setContactError("Finish editing the current contact before adding a new one.")
      return
    }
    const newContact: ContactPersonDraft = {
      name: "",
      phone: "",
      email: "",
      relation: "",
      isNew: true,
    }
    const newIndex = contactPersons.length
    setContactPersons((previous) => [...previous, newContact])
    setContactEditIndex(newIndex)
    setContactDraft({ ...newContact })
    setContactError("")
  }

  const beginEditContactPerson = (index: number) => {
    if (contactEditIndex !== null) {
      setContactError("Finish editing the current contact before editing another.")
      return
    }
    const person = contactPersons[index]
    if (!person) return
    setContactEditIndex(index)
    setContactDraft({ ...person })
    setContactError("")
  }

  const handleContactDraftChange = (field: keyof ContactPersonDraft, value: string) => {
    setContactDraft((previous) => (previous ? { ...previous, [field]: value } : previous))
  }

  const handleCancelContact = () => {
    if (contactEditIndex === null) return
    setContactPersons((previous) => {
      const person = previous[contactEditIndex]
      if (person && person.isNew && !person.id) {
        return previous.filter((_, idx) => idx !== contactEditIndex)
      }
      return previous
    })
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError("")
  }

  const handleSaveContact = () => {
    if (contactEditIndex === null || !contactDraft) return
    const name = contactDraft.name.trim()
    if (!name) {
      setContactError("Contact name is required.")
      return
    }

    const sanitized: ContactPersonDraft = {
      id: contactDraft.id,
      name,
      phone: contactDraft.phone.trim(),
      email: contactDraft.email.trim(),
      relation: contactDraft.relation.trim(),
    }

    setContactPersons((previous) =>
      previous.map((person, idx) => (idx === contactEditIndex ? sanitized : person)),
    )
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError("")
  }

  const handleRemoveContact = (index: number) => {
    if (contactEditIndex !== null && contactEditIndex !== index) {
      setContactError("Finish editing the current contact before removing another.")
      return
    }
    setContactPersons((previous) => previous.filter((_, idx) => idx !== index))
    if (contactEditIndex !== null) {
      if (index === contactEditIndex) {
        setContactEditIndex(null)
        setContactDraft(null)
      } else if (index < contactEditIndex) {
        setContactEditIndex(contactEditIndex - 1)
      }
    }
    setContactError("")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!contractId) return

    setError("")
    setSaving(true)

    if (contactEditIndex !== null) {
      setContactError("Save or cancel the contact person you are editing before saving the contract.")
      setSaving(false)
      return
    }

    setContactError("")

    try {
      const normalizedContactPersons = contactPersons
        .map((person) => {
          const name = person.name.trim()
          if (!name) return null
          const phone = person.phone.trim()
          const email = person.email.trim()
          const relation = person.relation.trim()
          return {
            name,
            phone: phone || undefined,
            email: email || undefined,
            relation: relation || undefined,
          }
        })
        .filter((person): person is {
          name: string
          phone: string | undefined
          email: string | undefined
          relation: string | undefined
        } => Boolean(person))

      const response = await fetch(`/api/contracts/${contractId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: parseFloat(value),
          servicePackage,
          contractType,
          scheduledStartDate,
          scheduledEndDate,
          actualStartDate: actualStartDate || null,
          actualEndDate: actualEndDate || null,
          firstPaymentOn,
          finalPaymentOn: finalPaymentOn || null,
          status,
          remarks,
          marketingSourceId: marketingSource !== "NONE" ? marketingSource : null,
          referenceIds: selectedReferenceIds.filter((id) => id !== (contractId ?? "")),
          contactPersons: normalizedContactPersons,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update contract")
      }

      if (checklistItems.length > 0) {
        try {
          await fetch(`/api/contracts/${contractId}/checklist`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateId: selectedTemplateId || undefined,
              items: checklistItems.map((item, index) => ({
                name: item.item.trim(),
                action:
                  buildActionFromTasks(sanitiseTasks(item.tasks ?? [])) ||
                  item.description.trim(),
                order: index + 1,
                category: item.category || DEFAULT_CATEGORY,
                isRequired: item.isRequired ?? true,
                tasks: sanitiseTasks(item.tasks ?? []).map((task, taskIndex) => ({
                  name: task.name.trim(),
                  details: task.details.trim(),
                  order: taskIndex + 1,
                })),
              })),
            }),
          })
        } catch {
          /* ignore errors when updating checklist */
        }
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

  const contractTypeLabel = contractType === "REPAIR" ? "Repair" : "Inspection"

  return (
    <div className="p-6 space-y-6">
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
        <div className="grid gap-6 min-[1400px]:grid-cols-3">
          <div className="min-[1400px]:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contract Information</CardTitle>
                <CardDescription>Update the contract details</CardDescription>
              </CardHeader>
              <CardContent>
                <ContractEditForm
                  error={error}
                  customer={customer}
                  address={address}
                  value={value}
                  onValueChange={setValue}
                  servicePackage={servicePackage}
                  onServicePackageChange={setServicePackage}
                  contractType={contractType}
                  onContractTypeChange={setContractType}
                  marketingSource={marketingSource}
                  marketingSourceOptions={marketingSourceOptions}
                  onMarketingSourceChange={setMarketingSource}
                  status={status}
                  onStatusChange={setStatus}
                  scheduledStartDate={scheduledStartDate}
                  onScheduledStartDateChange={setScheduledStartDate}
                  scheduledEndDate={scheduledEndDate}
                  onScheduledEndDateChange={setScheduledEndDate}
                  actualStartDate={actualStartDate}
                  onActualStartDateChange={setActualStartDate}
                  actualEndDate={actualEndDate}
                  onActualEndDateChange={setActualEndDate}
                  firstPaymentOn={firstPaymentOn}
                  onFirstPaymentOnChange={setFirstPaymentOn}
                  finalPaymentOn={finalPaymentOn}
                  onFinalPaymentOnChange={setFinalPaymentOn}
                  remarks={remarks}
                  onRemarksChange={setRemarks}
                  availableReferences={availableReferences}
                  selectedReferenceIds={selectedReferenceIds}
                  onReferenceIdsChange={setSelectedReferenceIds}
                />


                <ChecklistLocationsEditor
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  onSelectedTemplateIdChange={setSelectedTemplateId}
                  checklistItems={checklistItems}
                  onChecklistItemsChange={setChecklistItems}
                />

              </CardContent>
            </Card>
          </div>

          <div className="min-[1400px]:col-span-1">
            <ContractEditSummary
              contractId={contractId}
              status={status}
              contractType={contractType}
              contractTypeLabel={contractTypeLabel}
              value={value}
              marketingSourceName={marketingSource !== 'NONE' ? (marketingSourceOptions.find((s) => s.id === marketingSource)?.name || null) : null}
              saving={saving}
            />

            <InspectorRatingsCard
              contractInspectors={contractInspectors}
              inspectorRatingsState={inspectorRatingsState}
              ratingSavingState={ratingSavingState}
              ratingError={ratingError}
              saving={saving}
              onChange={handleInspectorRatingChange}
            />

            <ContactPersonsCard
              contactPersons={contactPersons}
              contactEditIndex={contactEditIndex}
              contactDraft={contactDraft}
              contactError={contactError}
              onBeginAddContact={beginAddContactPerson}
              onBeginEditContact={beginEditContactPerson}
              onContactFieldChange={handleContactDraftChange}
              onCancelContact={handleCancelContact}
              onSaveContact={handleSaveContact}
              onRemoveContact={handleRemoveContact}
            />

            <StatusGuideCard />
          </div>
        </div>
      </form>
    </div>
  )
}
