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

export type ChecklistDraftItem = {
  item: string
  description: string
  order: number
  isRequired?: boolean
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

export type MarketingSource = "GOOGLE" | "REFERRAL" | "OTHERS" | "NONE"

export type ContractStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "SCHEDULED"
  | "COMPLETED"
  | "TERMINATED"
  | "CANCELLED"
