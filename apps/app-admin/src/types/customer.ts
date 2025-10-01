export interface CustomerAddress {
  id: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  propertySizeRange?: string | null
  relationship?: string | null
  remarks?: string | null
  status: string
}

export interface CustomerContractSummary {
  id: string
  value: number | string
  scheduledStartDate: string
  status: string
  workOrders: Array<{ id: string }>
  address: {
    address: string
    postalCode: string
  }
}

export interface CustomerRecord {
  id: string
  name: string
  type: string
  personInCharge: string
  email: string
  phone: string
  billingAddress: string
  status: string
  isMember: boolean
  memberTier?: string | null
  memberSince?: string | null
  memberExpiredOn?: string | null
  remarks?: string | null
  createdOn: string
  addresses: CustomerAddress[]
  contracts: CustomerContractSummary[]
}

export interface NewCustomerAddress {
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  propertySizeRange?: string | null
  relationship?: string | null
  remarks?: string | null
}
