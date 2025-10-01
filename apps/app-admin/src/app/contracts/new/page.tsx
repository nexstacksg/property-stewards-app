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
import { ArrowLeft, Loader2, Search, Plus, X, GripVertical, Pencil } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"
import { PhoneInput } from "@/components/ui/phone-input"
import { ChecklistTagLibrary } from "@/components/checklists/checklist-tag-library"

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
  const [contractType, setContractType] = useState<'INSPECTION' | 'REPAIR'>("INSPECTION")
  const [value, setValue] = useState("")
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [firstPaymentOn, setFirstPaymentOn] = useState("")
  const [remarks, setRemarks] = useState("")

  // Checklist template + inline edit state
  type ChecklistDraftItem = { item: string; description: string; order: number; isRequired?: boolean }
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([])
  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditItem, setRowEditItem] = useState<ChecklistDraftItem | null>(null)
  type ContractReferenceOption = { id: string; label: string }
  type ContactPersonDraft = {
    id?: string
    name: string
    phone: string
    email: string
    relation: string
    isNew?: boolean
  }
  const [availableReferences, setAvailableReferences] = useState<ContractReferenceOption[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [marketingSource, setMarketingSource] = useState<'GOOGLE' | 'REFERRAL' | 'OTHERS' | 'NONE'>('NONE')
  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([])
  const [contactEditIndex, setContactEditIndex] = useState<number | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactPersonDraft | null>(null)
  const [contactError, setContactError] = useState("")

  useEffect(() => {
    // Preload all templates so user can choose without selecting address/customer first
    fetchTemplates()
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
      setContactPersons([])
      setContactEditIndex(null)
      setContactDraft(null)
      setContactError('')
      
      // Select first active address if available
      const activeAddress = customer.addresses.find(addr => addr.status === 'ACTIVE')
      if (activeAddress) {
        setAddressId(activeAddress.id)
        // preload templates for the selected address type
        fetchTemplates(activeAddress.propertyType)
      } else {
        fetchTemplates()
      }

      fetchCustomerContracts(customer.id)
      setSelectedReferenceIds([])
    } catch (err) {
      console.error('Error fetching customer:', err)
    }
  }

  // Templates loader by property type (optional)
  const fetchTemplates = async (propertyType?: string) => {
    try {
      const url = propertyType
        ? `/api/checklist-templates?propertyType=${encodeURIComponent(propertyType)}`
        : `/api/checklist-templates`
      const res = await fetch(url)
      if (!res.ok) { setTemplates([]); return }
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch { setTemplates([]) }
  }

  const fetchCustomerContracts = async (customerId: string) => {
    try {
      const res = await fetch(`/api/contracts?customerId=${customerId}&limit=100`)
      if (!res.ok) { setAvailableReferences([]); return }
      const data = await res.json()
      const options: ContractReferenceOption[] = Array.isArray(data.contracts)
        ? data.contracts
            .filter((contract: any) => contract && typeof contract.id === 'string')
            .map((contract: any) => ({
              id: contract.id,
              label: `#${contract.id.slice(-8).toUpperCase()} • ${contract.status}`
            }))
        : []
      setAvailableReferences(options)
    } catch {
      setAvailableReferences([])
    }
  }

  // Load chosen template items
  const loadTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) { setChecklistItems([]); return }
    // try local templates first
    const local = templates.find(t => t.id === templateId)
    if (local && Array.isArray(local.items)) {
          const items = local.items.map((it: any, idx: number) => ({
            item: it.name,
            description: it.action || '',
            order: it.order ?? idx + 1,
            isRequired: true
          }))
      setChecklistItems(items)
      return
    }
    // fallback: fetch full checklist
    try {
      const res = await fetch(`/api/checklists/${templateId}`)
      if (!res.ok) return
      const tpl = await res.json()
      const items = (tpl.items || []).map((it: any, idx: number) => ({
        item: it.name,
        description: it.action || '',
        order: it.order ?? idx + 1,
        isRequired: true
      }))
      setChecklistItems(items)
    } catch {}
  }

  const addBlankChecklistItem = () => {
    const newItem: ChecklistDraftItem = { item: '', description: '', order: 1, isRequired: true }
    setChecklistItems((prev) => {
      const updated = [newItem, ...prev.map((item) => ({ ...item }))]
      return updated.map((item, index) => ({ ...item, order: index + 1 }))
    })
    setRowEditIndex(0)
    setRowEditItem({ ...newItem })
  }

  const moveChecklistItem = (index: number, dir: 'up'|'down') => {
    if ((dir === 'up' && index === 0) || (dir === 'down' && index === checklistItems.length - 1)) return
    const arr = [...checklistItems]
    const j = dir === 'up' ? index - 1 : index + 1
    ;[arr[index], arr[j]] = [arr[j], arr[index]]
    arr.forEach((it, k) => (it.order = k + 1))
    setChecklistItems(arr)
  }

  const removeChecklistItem = (index: number) => {
    const arr = checklistItems.filter((_, i) => i !== index).map((it, k) => ({ ...it, order: k + 1 }))
    setChecklistItems(arr)
    if (rowEditIndex === index) { setRowEditIndex(null); setRowEditItem(null) }
  }

  const startRowEdit = (index: number) => {
    setRowEditIndex(index)
    setRowEditItem({ ...checklistItems[index] })
  }

  const cancelRowEdit = () => { setRowEditIndex(null); setRowEditItem(null) }
  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditItem) return
    const arr = [...checklistItems]
    arr[rowEditIndex] = { ...rowEditItem, order: rowEditIndex + 1 }
    setChecklistItems(arr)
    setRowEditIndex(null); setRowEditItem(null)
  }

  const applyTagToChecklist = (label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return

    if (rowEditIndex !== null) {
      setRowEditItem(prev => prev ? { ...prev, item: trimmed } : { item: trimmed, description: '', order: rowEditIndex + 1, isRequired: true })
      return
    }

    const newItem: ChecklistDraftItem = {
      item: trimmed,
      description: '',
      order: 1,
      isRequired: true
    }
    setChecklistItems((prev) => {
      const updated = [newItem, ...prev.map((item) => ({ ...item }))]
      return updated.map((item, index) => ({ ...item, order: index + 1 }))
    })
    setRowEditIndex(0)
    setRowEditItem({ ...newItem })
  }

  // Contact person helpers
  const beginAddContactPerson = () => {
    if (contactEditIndex !== null) {
      setContactError('Finish editing the current contact before adding a new one.')
      return
    }
    const newContact: ContactPersonDraft = {
      name: '',
      phone: '',
      email: '',
      relation: '',
      isNew: true
    }
    const newIndex = contactPersons.length
    setContactPersons(prev => [...prev, newContact])
    setContactEditIndex(newIndex)
    setContactDraft({ ...newContact })
    setContactError('')
  }

  const beginEditContactPerson = (index: number) => {
    if (contactEditIndex !== null) {
      setContactError('Finish editing the current contact before editing another.')
      return
    }
    const person = contactPersons[index]
    if (!person) return
    setContactEditIndex(index)
    setContactDraft({ ...person })
    setContactError('')
  }

  const handleContactDraftChange = (field: keyof ContactPersonDraft, value: string) => {
    setContactDraft(prev => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleCancelContact = () => {
    if (contactEditIndex === null) return
    setContactPersons(prev => {
      const person = prev[contactEditIndex]
      if (person && person.isNew && !person.id) {
        return prev.filter((_, idx) => idx !== contactEditIndex)
      }
      return prev
    })
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError('')
  }

  const handleSaveContact = () => {
    if (contactEditIndex === null || !contactDraft) return
    const name = contactDraft.name.trim()
    if (!name) {
      setContactError('Contact name is required.')
      return
    }

    const sanitized: ContactPersonDraft = {
      id: contactDraft.id,
      name,
      phone: contactDraft.phone.trim(),
      email: contactDraft.email.trim(),
      relation: contactDraft.relation.trim()
    }

    setContactPersons(prev => prev.map((person, idx) => (idx === contactEditIndex ? sanitized : person)))
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError('')
  }

  const handleRemoveContact = (index: number) => {
    if (contactEditIndex !== null && contactEditIndex !== index) {
      setContactError('Finish editing the current contact before removing another.')
      return
    }
    setContactPersons(prev => prev.filter((_, idx) => idx !== index))
    if (contactEditIndex !== null) {
      if (index === contactEditIndex) {
        setContactEditIndex(null)
        setContactDraft(null)
      } else if (index < contactEditIndex) {
        setContactEditIndex(contactEditIndex - 1)
      }
    }
    setContactError('')
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
    } catch (err) {
      console.error('Error searching customers:', err)
    } finally {
      setSearching(false)
    }
  }

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm) {
        searchCustomers(searchTerm)
      } else {
        setCustomers([])
      }
    }, 300) // 300ms delay

    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm])

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setCustomers([])
    setSearchTerm("")
    
    // Select first active address if available
    const activeAddress = customer.addresses.find(addr => addr.status === 'ACTIVE')
    if (activeAddress) {
      setAddressId(activeAddress.id)
    }
    fetchCustomerContracts(customer.id)
    setSelectedReferenceIds([])
    // Try to preload templates for the customer's first active address (does not clear current selection)
    // if (activeAddress) {
    //   fetchTemplates(activeAddress.propertyType)
    // } else {
    //   fetchTemplates()
    // }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer || !addressId) {
      setError("Please select a customer and address")
      return
    }

    if (contactEditIndex !== null) {
      setContactError('Save or cancel the contact person you are editing before submitting.')
      return
    }

    setContactError('')
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
            relation: relation || undefined
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
          marketingSource: marketingSource !== 'NONE' ? marketingSource : undefined,
          referenceIds: selectedReferenceIds,
          contactPersons: normalizedContactPersons
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create contract")
      }

      const contract = await response.json()
      // Attach checklist if items present
      if (checklistItems.length > 0) {
        try {
          await fetch(`/api/contracts/${contract.id}/checklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId: selectedTemplateId || undefined,
              items: checklistItems.map((it, idx) => ({ name: it.item, action: it.description, order: idx + 1 }))
            })
          })
        } catch {}
      }
      router.push(`/contracts/${contract.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setLoading(false)
    }
  }

  const contractTypeLabel = contractType === 'REPAIR' ? 'Repair' : 'Inspection'

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
                      <div className="relative">
                        <Input
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Start typing to search by name, email, or phone"
                          className="pr-10"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {searching ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : searchTerm ? (
                            <Search className="h-4 w-4 text-muted-foreground" />
                          ) : null}
                        </div>
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
                            setContactPersons([])
                            setContactEditIndex(null)
                            setContactDraft(null)
                            setContactError('')
                            setAvailableReferences([])
                            setSelectedReferenceIds([])
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
                  <Label htmlFor="contractType">Contract Type</Label>
                  <Select
                    value={contractType}
                    onValueChange={(value) => setContractType(value as 'INSPECTION' | 'REPAIR')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INSPECTION">Inspection</SelectItem>
                      <SelectItem value="REPAIR">Repair</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Source of Marketing</Label>
                  <Select value={marketingSource} onValueChange={(value) => setMarketingSource(value as 'GOOGLE' | 'REFERRAL' | 'OTHERS' | 'NONE')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Not specified</SelectItem>
                      <SelectItem value="GOOGLE">Google</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="OTHERS">Others</SelectItem>
                    </SelectContent>
                  </Select>
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

                {selectedCustomer && (
                  <div className="space-y-2">
                    <Label>Reference Contracts</Label>
                    {availableReferences.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No existing contracts for this customer yet.</p>
                    ) : (
                      <>
                        <select
                          multiple
                          value={selectedReferenceIds}
                          onChange={(event) => {
                            const options = Array.from(event.target.selectedOptions)
                            setSelectedReferenceIds(options.map(option => option.value))
                          }}
                          className="w-full min-h-[120px] border rounded-md px-3 py-2"
                        >
                          {availableReferences.map((contract) => (
                            <option key={contract.id} value={contract.id}>
                              {contract.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">Hold Ctrl/Cmd to select multiple contracts.</p>
                      </>
                    )}
                  </div>
                )}

                {/* Checklist (under Contract Information) */}
                <div className="pt-6">
                  <h3 className="text-lg font-semibold mb-2">Checklist</h3>
                  <p className="text-sm text-muted-foreground mb-4">Select a template and optionally edit items before creating the contract</p>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <Label>Template</Label>
                        <Select value={selectedTemplateId} onValueChange={loadTemplate}>
                          <SelectTrigger>
                            <SelectValue placeholder={'Select a template'} />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="outline" className="mb-2" onClick={addBlankChecklistItem}>
                          <Plus className="h-4 w-4 mr-2" /> Add Item
                        </Button>
                      </div>
                    </div>

                    <ChecklistTagLibrary onApplyTag={applyTagToChecklist} />

                    {checklistItems.length > 0 ? (
                      <div className="space-y-2">
                        {checklistItems.map((it, index) => (
                          <div key={index} className="border rounded-lg p-3 flex items-start gap-2">
                            <div className="flex flex-col gap-1 pt-1">
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveChecklistItem(index, 'up')} disabled={index===0}>↑</Button>
                              <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveChecklistItem(index, 'down')} disabled={index===checklistItems.length-1}>↓</Button>
                            </div>
                            <div className="flex-1">
                              {rowEditIndex === index ? (
                                <div className="space-y-2">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label>Item Name *</Label>
                                      <Input value={rowEditItem?.item||''} onChange={(e)=> setRowEditItem(prev => prev ? { ...prev, item: e.target.value } : prev)} />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                      <Label>Description</Label>
                                      <Input value={rowEditItem?.description||''} onChange={(e)=> setRowEditItem(prev => prev ? { ...prev, description: e.target.value } : prev)} />
                                    </div>
                                    <div className="flex items-center justify-end md:col-span-2 gap-2">
                                      <Button type="button" variant="outline" size="sm" onClick={cancelRowEdit}>Cancel</Button>
                                      <Button type="button" size="sm" onClick={saveRowEdit} disabled={!rowEditItem?.item?.trim()}>Save</Button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-medium">{it.order}. {it.item}</p>
                                    {it.description && <p className="text-sm text-muted-foreground">{it.description}</p>}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button type="button" variant="ghost" size="icon" onClick={()=>startRowEdit(index)} aria-label="Edit item"><Pencil className="h-4 w-4" /></Button>
                                    <Button type="button" variant="ghost" size="icon" onClick={()=>removeChecklistItem(index)} aria-label="Remove"><X className="h-4 w-4" /></Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No checklist items selected. Choose a template or add items.</p>
                    )}
                  </div>
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
                  <Badge variant={contractType === 'REPAIR' ? 'outline' : 'secondary'}>
                    {contractTypeLabel}
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

                {marketingSource !== 'NONE' && (
                  <div>
                    <p className="text-sm text-muted-foreground">Source of Marketing</p>
                    <Badge variant="outline">{marketingSource === 'GOOGLE' ? 'Google' : marketingSource === 'REFERRAL' ? 'Referral' : 'Others'}</Badge>
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
                <CardTitle className="text-sm">Contact Persons</CardTitle>
                <CardDescription>Keep track of stakeholders linked to this contract.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {contactPersons.length === 0 && (
                  <p className="text-sm text-muted-foreground">No contact persons added.</p>
                )}

                {contactPersons.map((person, index) => {
                  const isEditing = contactEditIndex === index && contactDraft
                  const editingAnother = contactEditIndex !== null && contactEditIndex !== index
                  return (
                    <div key={index} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">Contact #{index + 1}</h4>
                        {!isEditing && !editingAnother && (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => beginEditContactPerson(index)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveContact(index)}>
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor={`contact-name-${index}`}>Name *</Label>
                            <Input
                              id={`contact-name-${index}`}
                              value={contactDraft?.name || ''}
                              onChange={(e) => handleContactDraftChange('name', e.target.value)}
                              placeholder="Full name"
                              autoFocus
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact-relation-${index}`}>Relation</Label>
                            <Input
                              id={`contact-relation-${index}`}
                              value={contactDraft?.relation || ''}
                              onChange={(e) => handleContactDraftChange('relation', e.target.value)}
                              placeholder="e.g., Owner"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact-phone-${index}`}>Phone</Label>
                            <PhoneInput
                              value={contactDraft?.phone || ''}
                              onChange={(value) => handleContactDraftChange('phone', value)}
                              placeholder="Contact number"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact-email-${index}`}>Email</Label>
                            <Input
                              id={`contact-email-${index}`}
                              value={contactDraft?.email || ''}
                              onChange={(e) => handleContactDraftChange('email', e.target.value)}
                              placeholder="Email address"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleCancelContact}>
                              Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={handleSaveContact}>
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <div className="font-medium">{person.name}</div>
                          <div className="text-muted-foreground">
                            {person.relation ? person.relation : 'Relation not specified'}
                          </div>
                          <div>
                            {person.phone ? (
                              <p>Phone: {person.phone}</p>
                            ) : (
                              <p className="text-muted-foreground">Phone not provided</p>
                            )}
                          </div>
                          <div>
                            {person.email ? (
                              <p>Email: {person.email}</p>
                            ) : (
                              <p className="text-muted-foreground">Email not provided</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={beginAddContactPerson}
                    disabled={contactEditIndex !== null}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Contact Person
                  </Button>
                  {contactError && (
                    <p className="text-sm text-destructive text-left">{contactError}</p>
                  )}
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
