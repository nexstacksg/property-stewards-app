"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
// checklist UI moved to component

import { CustomerSelection } from "@/components/contracts/new/customer-selection"
import { ContractDetailsForm } from "@/components/contracts/new/contract-details-form"
import { ContractSummary } from "@/components/contracts/new/contract-summary"
import { ContactPersonPanel } from "@/components/contracts/new/contact-person-panel"
import { NextStepsCard } from "@/components/contracts/new/next-steps-card"
import type {
  Address,
  ChecklistDraftItem,
  ChecklistTemplate,
  ContractReferenceOption,
  ContactPersonDraft,
  ContractType,
  Customer,
  MarketingSourceOption,
  MarketingSourceSelectValue,
} from "@/components/contracts/types"
import { NewChecklistLocationsEditor } from "@/components/contracts/new/checklist-locations-editor"

import {
  DEFAULT_CATEGORY,
  buildActionFromTasks,
  sanitiseTasks,
} from "@/components/contracts/edit/checklist-utils"

function NewContractPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedCustomerId = searchParams.get("customerId")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [addressId, setAddressId] = useState("")
  const [servicePackage, setServicePackage] = useState("")
  const [contractType, setContractType] = useState<ContractType>("INSPECTION")
  const [value, setValue] = useState("")
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [firstPaymentOn, setFirstPaymentOn] = useState("")
  const [remarks, setRemarks] = useState("")

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([])
  // checklist editing state moved into NewChecklistLocationsEditor component

  const [availableReferences, setAvailableReferences] = useState<ContractReferenceOption[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [marketingSource, setMarketingSource] = useState<MarketingSourceSelectValue>("NONE")
  const [marketingSourceOptions, setMarketingSourceOptions] = useState<MarketingSourceOption[]>([])

  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([])
  const [contactEditIndex, setContactEditIndex] = useState<number | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactPersonDraft | null>(null)
  const [contactError, setContactError] = useState("")

  useEffect(() => {
    fetchTemplates()
    if (preselectedCustomerId) {
      fetchCustomer(preselectedCustomerId)
    }
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
  }, [preselectedCustomerId])

  const fetchCustomer = async (customerId: string) => {
    try {
      const response = await fetch(`/api/customers/${customerId}`)
      if (!response.ok) throw new Error("Failed to fetch customer")

      const customer: Customer = await response.json()
      setSelectedCustomer(customer)
      setContactPersons([])
      setContactEditIndex(null)
      setContactDraft(null)
      setContactError("")

      const activeAddress = customer.addresses.find((address: Address) => address.status === "ACTIVE")
      if (activeAddress) {
        setAddressId(activeAddress.id)
        fetchTemplates(activeAddress.propertyType)
      } else {
        fetchTemplates()
      }

      fetchCustomerContracts(customer.id)
      setSelectedReferenceIds([])
    } catch (error) {
      console.error("Error fetching customer:", error)
    }
  }

  const fetchTemplates = async (propertyType?: string) => {
    try {
      const url = propertyType
        ? `/api/checklist-templates?propertyType=${encodeURIComponent(propertyType)}`
        : `/api/checklist-templates`
      const res = await fetch(url)
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

  const fetchCustomerContracts = async (customerId: string) => {
    try {
      const res = await fetch(`/api/contracts?customerId=${customerId}&limit=100`)
      if (!res.ok) {
        setAvailableReferences([])
        return
      }
      const data = await res.json()
      const options: ContractReferenceOption[] = Array.isArray(data.contracts)
        ? data.contracts
            .filter((contract: any) => contract && typeof contract.id === "string")
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

  // checklist handlers moved into NewChecklistLocationsEditor component

  const handleRowEditChange = (updates: Partial<ChecklistDraftItem>) => {
    setRowEditItem((previous) =>
      previous
        ? {
            ...previous,
            ...updates,
          }
        : previous,
    )
  }

  // tag application handled in component

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

  const searchCustomers = async (term: string) => {
    if (!term) {
      setCustomers([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/customers?search=${encodeURIComponent(term)}&limit=10`)
      if (!response.ok) throw new Error("Failed to search customers")
      const data = await response.json()
      setCustomers(data.customers)
    } catch (error) {
      console.error("Error searching customers:", error)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchTerm) {
        searchCustomers(searchTerm)
      } else {
        setCustomers([])
      }
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [searchTerm])

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomers([])
    setSearchTerm("")

    const activeAddress = customer.addresses.find((address) => address.status === "ACTIVE")
    if (activeAddress) {
      setAddressId(activeAddress.id)
    }
    fetchCustomerContracts(customer.id)
    setSelectedReferenceIds([])
  }

  const resetCustomer = () => {
    setSelectedCustomer(null)
    setAddressId("")
    setContactPersons([])
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError("")
    setAvailableReferences([])
    setSelectedReferenceIds([])
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedCustomer || !addressId) {
      setError("Please select a customer and address")
      return
    }

    if (contactEditIndex !== null) {
      setContactError("Save or cancel the contact person you are editing before submitting.")
      return
    }

    setContactError("")
    setError("")
    setLoading(true)

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
          remarks,
          contractType,
          marketingSourceId: marketingSource !== "NONE" ? marketingSource : undefined,
          referenceIds: selectedReferenceIds,
          contactPersons: normalizedContactPersons,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create contract")
      }

      const contract = await response.json()
      if (checklistItems.length > 0) {
        try {
          await fetch(`/api/contracts/${contract.id}/checklist`, {
            method: "POST",
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
          /* ignore checklist errors */
        }
      }
      router.push(`/contracts/${contract.id}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : "An error occurred")
      setLoading(false)
    }
  }

  const contractTypeLabel = contractType === "REPAIR" ? "Repair" : "Inspection"
  const canSubmit = Boolean(selectedCustomer) && Boolean(addressId)

  return (
    <div className="p-6 space-y-6">
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
        <div className="grid gap-6 min-[1400px]:grid-cols-3">
          <div className="min-[1400px]:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contract Information</CardTitle>
                <CardDescription>Enter the contract details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">{error}</div>
                )}

                <CustomerSelection
                  selectedCustomer={selectedCustomer}
                  customers={customers}
                  searchTerm={searchTerm}
                  searching={searching}
                  addressId={addressId}
                  onSearchTermChange={setSearchTerm}
                  onSelectCustomer={selectCustomer}
                  onResetCustomer={resetCustomer}
                  onAddressChange={setAddressId}
                />

                <ContractDetailsForm
                  servicePackage={servicePackage}
                  contractType={contractType}
                  marketingSource={marketingSource}
                  marketingSourceOptions={marketingSourceOptions}
                  value={value}
                  scheduledStartDate={scheduledStartDate}
                  scheduledEndDate={scheduledEndDate}
                  firstPaymentOn={firstPaymentOn}
                  remarks={remarks}
                  availableReferences={availableReferences}
                  selectedReferenceIds={selectedReferenceIds}
                  selectedCustomer={selectedCustomer}
                  onServicePackageChange={setServicePackage}
                  onContractTypeChange={setContractType}
                  onMarketingSourceChange={setMarketingSource}
                  onValueChange={setValue}
                  onScheduledStartDateChange={setScheduledStartDate}
                  onScheduledEndDateChange={setScheduledEndDate}
                  onFirstPaymentOnChange={setFirstPaymentOn}
                  onRemarksChange={setRemarks}
                  onReferenceIdsChange={setSelectedReferenceIds}
                />

                

                <NewChecklistLocationsEditor
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
            <ContractSummary
              contractType={contractType}
              contractTypeLabel={contractTypeLabel}
              value={value}
              marketingSourceName={marketingSource !== 'NONE' ? (marketingSourceOptions.find((s) => s.id === marketingSource)?.name || null) : null}
              canSubmit={canSubmit}
              loading={loading}
            />

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Contact Persons</CardTitle>
                <CardDescription>Keep track of stakeholders linked to this contract.</CardDescription>
              </CardHeader>
              <CardContent>
                <ContactPersonPanel
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
              </CardContent>
            </Card>

            <NextStepsCard />
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
