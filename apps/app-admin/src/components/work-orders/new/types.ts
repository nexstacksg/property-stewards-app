export interface Contract {
  id: string
  status: string
  value: string
  scheduledStartDate: string
  scheduledEndDate: string
  customer: {
    id: string
    name: string
    email: string
    phone: string
  }
  address: {
    id: string
    address: string
    postalCode: string
    propertyType: string
    propertySize: string
  }
}

export interface Inspector {
  id: string
  name: string
  mobilePhone: string
  type: string
  specialization: string[]
  status: string
}
