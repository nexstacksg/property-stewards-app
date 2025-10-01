"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ContractEditForm } from "@/components/contracts/edit/contract-edit-form"
import { ContractEditSummary } from "@/components/contracts/edit/contract-edit-summary"
import { ContactPersonsCard } from "@/components/contracts/edit/contact-persons-card"
import { StatusGuideCard } from "@/components/contracts/edit/status-guide-card"
import type {
  ChecklistDraftItem,
  ChecklistTemplate,
  ContractAddressSummary,
  ContractCustomerSummary,
  ContractReferenceOption,
  ContactPersonDraft,
  ContractStatus,
  ContractType,
  MarketingSource,
} from "@/components/contracts/types"

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
  marketingSource?: Exclude<MarketingSource, "NONE"> | null
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
  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditItem, setRowEditItem] = useState<ChecklistDraftItem | null>(null)

  const [availableReferences, setAvailableReferences] = useState<ContractReferenceOption[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [marketingSource, setMarketingSource] = useState<MarketingSource>("NONE")

  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([])
  const [contactEditIndex, setContactEditIndex] = useState<number | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactPersonDraft | null>(null)
  const [contactError, setContactError] = useState("")

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
      setMarketingSource(contract.marketingSource || "NONE")
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

      fetchTemplates()
      fetchCustomerContracts(contract.customerId, contract.id)

      try {
        const basedOnId = contract.basedOnChecklist?.id
        if (basedOnId) setSelectedTemplateId(basedOnId)
        const checklist = contract.contractChecklist
        if (checklist && Array.isArray(checklist.items)) {
          const items = checklist.items
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((item, index) => ({
              item: item.name,
              description: item.remarks || "",
              order: item.order ?? index + 1,
            }))
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
              label: `#${contract.id.slice(-8).toUpperCase()} • ${contract.status}`,
            }))
        : []
      setAvailableReferences(options)
    } catch {
      setAvailableReferences([])
    }
  }

  const loadTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) {
      setChecklistItems([])
      return
    }
    const local = templates.find((template) => template.id === templateId)
    if (local && Array.isArray(local.items)) {
      const items = local.items.map((item: any, index: number) => ({
        item: item.name,
        description: item.action || "",
        order: item.order ?? index + 1,
        isRequired: true,
      }))
      setChecklistItems(items)
      return
    }
    try {
      const res = await fetch(`/api/checklists/${templateId}`)
      if (!res.ok) return
      const tpl = await res.json()
      const items = (tpl.items || []).map((item: any, index: number) => ({
        item: item.name,
        description: item.action || "",
        order: item.order ?? index + 1,
        isRequired: true,
      }))
      setChecklistItems(items)
    } catch {
      /* noop */
    }
  }

  const addBlankChecklistItem = () => {
    const newItem: ChecklistDraftItem = {
      item: "",
      description: "",
      order: 1,
      isRequired: true,
    }
    setChecklistItems((previous) => {
      const updated = [newItem, ...previous.map((item) => ({ ...item }))]
      return updated.map((item, index) => ({ ...item, order: index + 1 }))
    })
    setRowEditIndex(0)
    setRowEditItem({ ...newItem })
  }

  const moveChecklistItem = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === checklistItems.length - 1)) return
    const items = [...checklistItems]
    const target = direction === "up" ? index - 1 : index + 1
    ;[items[index], items[target]] = [items[target], items[index]]
    items.forEach((item, idx) => {
      item.order = idx + 1
    })
    setChecklistItems(items)
  }

  const removeChecklistItem = (index: number) => {
    const items = checklistItems
      .filter((_, currentIndex) => currentIndex !== index)
      .map((item, idx) => ({ ...item, order: idx + 1 }))
    setChecklistItems(items)
    if (rowEditIndex === index) {
      setRowEditIndex(null)
      setRowEditItem(null)
    }
  }

  const startRowEdit = (index: number) => {
    setRowEditIndex(index)
    setRowEditItem({ ...checklistItems[index] })
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null)
    setRowEditItem(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditItem) return
    const items = [...checklistItems]
    items[rowEditIndex] = { ...rowEditItem, order: rowEditIndex + 1 }
    setChecklistItems(items)
    setRowEditIndex(null)
    setRowEditItem(null)
  }

  const handleRowEditChange = (updates: Partial<ChecklistDraftItem>) => {
    setRowEditItem((previous) => (previous ? { ...previous, ...updates } : previous))
  }

  const applyTagToChecklist = (label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return

    if (rowEditIndex !== null) {
      setRowEditItem((previous) => (previous ? { ...previous, item: trimmed } : previous))
      return
    }

    const newItem: ChecklistDraftItem = {
      item: trimmed,
      description: "",
      order: 1,
      isRequired: true,
    }
    setChecklistItems((previous) => {
      const updated = [newItem, ...previous.map((item) => ({ ...item }))]
      return updated.map((item, index) => ({ ...item, order: index + 1 }))
    })
    setRowEditIndex(0)
    setRowEditItem({ ...newItem })
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
          marketingSource: marketingSource !== "NONE" ? marketingSource : null,
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
                name: item.item,
                action: item.description,
                order: index + 1,
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
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
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
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  checklistItems={checklistItems}
                  rowEditIndex={rowEditIndex}
                  rowEditItem={rowEditItem}
                  onSelectTemplate={loadTemplate}
                  onAddBlankItem={addBlankChecklistItem}
                  onMoveItem={moveChecklistItem}
                  onRemoveItem={removeChecklistItem}
                  onStartEdit={startRowEdit}
                  onCancelEdit={cancelRowEdit}
                  onSaveEdit={saveRowEdit}
                  onRowEditChange={handleRowEditChange}
                  onApplyTag={applyTagToChecklist}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <ContractEditSummary
              contractId={contractId}
              status={status}
              contractType={contractType}
              contractTypeLabel={contractTypeLabel}
              value={value}
              marketingSource={marketingSource}
              saving={saving}
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
