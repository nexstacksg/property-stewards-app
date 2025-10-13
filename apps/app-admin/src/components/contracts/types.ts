export interface Address {
  id: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  status: string
}

export interface ContractAddressSummary {
  id: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  propertySizeRange?: string | null
  relationship?: string | null
}

export interface Customer {
  id: string
  name: string
  type: string
  email: string
  phone: string
  addresses: Address[]
}

export interface ContractCustomerSummary {
  id: string
  name: string
  email: string
  phone: string
}

export type ChecklistTaskDraft = {
  id?: string
  name: string
  details: string
}

export type ChecklistDraftItem = {
  item: string
  description: string
  order: number
  isRequired?: boolean
  category?: string
  tasks?: ChecklistTaskDraft[]
}

export interface ChecklistTemplateItem {
  name: string
  action?: string
  order?: number
}

export interface ChecklistTemplate {
  id: string
  name: string
  items?: ChecklistTemplateItem[]
}

export type ContractReferenceOption = {
  id: string
  label: string
  status?: string
  address?: string | null
  postalCode?: string | null
  scheduledStartDate?: string | null
  scheduledEndDate?: string | null
  value?: number | null
  workOrderCount?: number
}

export type ContactPersonDraft = {
  id?: string
  name: string
  phone: string
  email: string
  relation: string
  isNew?: boolean
}

export type ContractType = "INSPECTION" | "REPAIR"

export type MarketingSourceOption = { id: string; name: string }
export type MarketingSourceSelectValue = string | "NONE"

export type ContractStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "SCHEDULED"
  | "COMPLETED"
  | "TERMINATED"
  | "CANCELLED"
