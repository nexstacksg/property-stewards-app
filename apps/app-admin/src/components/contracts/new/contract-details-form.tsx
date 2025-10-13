"use client"

import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import type {
  Customer,
  ContractReferenceOption,
  ContractType,
  MarketingSourceOption,
  MarketingSourceSelectValue,
} from "../types"

interface ContractDetailsFormProps {
  servicePackage: string
  contractType: ContractType
  marketingSource: MarketingSourceSelectValue
  marketingSourceOptions: MarketingSourceOption[]
  value: string
  scheduledStartDate: string
  scheduledEndDate: string
  firstPaymentOn: string
  remarks: string
  availableReferences: ContractReferenceOption[]
  selectedReferenceIds: string[]
  selectedCustomer: Customer | null
  onServicePackageChange: (value: string) => void
  onContractTypeChange: (value: ContractType) => void
  onMarketingSourceChange: (value: MarketingSourceSelectValue) => void
  onValueChange: (value: string) => void
  onScheduledStartDateChange: (value: string) => void
  onScheduledEndDateChange: (value: string) => void
  onFirstPaymentOnChange: (value: string) => void
  onRemarksChange: (value: string) => void
  onReferenceIdsChange: (ids: string[]) => void
}

export function ContractDetailsForm({
  servicePackage,
  contractType,
  marketingSource,
  marketingSourceOptions,
  value,
  scheduledStartDate,
  scheduledEndDate,
  firstPaymentOn,
  remarks,
  availableReferences,
  selectedReferenceIds,
  selectedCustomer,
  onServicePackageChange,
  onContractTypeChange,
  onMarketingSourceChange,
  onValueChange,
  onScheduledStartDateChange,
  onScheduledEndDateChange,
  onFirstPaymentOnChange,
  onRemarksChange,
  onReferenceIdsChange,
}: ContractDetailsFormProps) {
  const toggleReference = (id: string) => {
    const exists = selectedReferenceIds.includes(id)
    const next = exists
      ? selectedReferenceIds.filter((x) => x !== id)
      : [...selectedReferenceIds, id]
    onReferenceIdsChange(next)
  }

  const formatDate = (value?: string | null) => {
    if (!value) return ""
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString("en-SG", { dateStyle: "medium" })
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="servicePackage">Service Package</Label>
          <Input
            id="servicePackage"
            value={servicePackage}
            onChange={(event) => onServicePackageChange(event.target.value)}
            placeholder="e.g., Premium Inspection"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contractType">Contract Type</Label>
          <Select
            value={contractType}
            onValueChange={(value) => onContractTypeChange(value as ContractType)}
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
          <Select value={marketingSource} onValueChange={(value) => onMarketingSourceChange(value as MarketingSourceSelectValue)}>
            <SelectTrigger>
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Not specified</SelectItem>
              {marketingSourceOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
              ))}
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
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
          <DatePicker
            value={scheduledStartDate}
            onChange={(date) =>
              onScheduledStartDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select start date"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduledEndDate">Scheduled End Date</Label>
          <DatePicker
            value={scheduledEndDate}
            onChange={(date) =>
              onScheduledEndDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select end date"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="firstPaymentOn">First Payment Due</Label>
          <DatePicker
            value={firstPaymentOn}
            onChange={(date) =>
              onFirstPaymentOnChange(date ? date.toISOString().split("T")[0] : "")
            }
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
          onChange={(event) => onRemarksChange(event.target.value)}
          placeholder="Optional notes about this contract"
        />
      </div>

      {selectedCustomer && (
        <div className="space-y-2">
          <Label>Reference Contracts</Label>
          {availableReferences.length === 0 ? (
            <p className="text-sm text-muted-foreground">No existing contracts for this customer yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Click to select or unselect. Multiple selections allowed.</p>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {availableReferences.map((ref) => {
                  const selected = selectedReferenceIds.includes(ref.id)
                  const start = formatDate(ref.scheduledStartDate)
                  const end = formatDate(ref.scheduledEndDate)
                  const schedule = start && end ? `${start} - ${end}` : start || end || undefined
                  return (
                    <button
                      key={ref.id}
                      type="button"
                      onClick={() => toggleReference(ref.id)}
                      aria-pressed={selected}
                      className={`w-full text-left rounded-md border p-3 transition-colors ${selected ? 'bg-accent/60 border-primary' : 'hover:bg-muted/40'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">#{ref.id} {ref.address ? `• ${ref.address}` : ''}</p>
                          <p className="text-xs text-muted-foreground">
                            {ref.postalCode ? `${ref.postalCode}` : ''}
                            {schedule ? `${ref.postalCode ? ' • ' : ''}${schedule}` : ''}
                            {typeof ref.workOrderCount === 'number' ? ` • ${ref.workOrderCount} work order(s)` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {ref.status && (
                            <Badge variant="outline">{ref.status}</Badge>
                          )}
                          {typeof ref.value === 'number' && !Number.isNaN(ref.value) && ref.value > 0 && (
                            <span className="text-xs text-muted-foreground">SGD {ref.value.toFixed(2)}</span>
                          )}
                          {selected && (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
