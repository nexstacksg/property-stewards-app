export const PROPERTY_SIZE_RANGE_OPTIONS = [
  { value: 'RANGE_50_399', label: '50-399 sqft' },
  { value: 'RANGE_400_699', label: '400-699 sqft' },
  { value: 'RANGE_700_899', label: '700-899 sqft' },
  { value: 'RANGE_900_1200', label: '900-1200 sqft' },
  { value: 'RANGE_1201_1399', label: '1201-1399 sqft' },
  { value: 'RANGE_1400_1599', label: '1400-1599 sqft' },
  { value: 'RANGE_1600_1999', label: '1600-1999 sqft' },
  { value: 'RANGE_2000_PLUS', label: '2000+ sqft' }
] as const

export const PROPERTY_RELATIONSHIP_OPTIONS = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'TENANT', label: 'Tenant' },
  { value: 'AGENT', label: 'Agent' }
] as const

const sizeRangeLookup = new Map(PROPERTY_SIZE_RANGE_OPTIONS.map((option) => [option.value, option.label]))
const relationshipLookup = new Map(PROPERTY_RELATIONSHIP_OPTIONS.map((option) => [option.value, option.label]))

export const DEFAULT_PROPERTY_SIZE_RANGE = PROPERTY_SIZE_RANGE_OPTIONS[0].value
export const DEFAULT_PROPERTY_RELATIONSHIP = PROPERTY_RELATIONSHIP_OPTIONS[0].value

export function formatPropertySizeRange(value?: string | null) {
  if (!value) return ''
  return sizeRangeLookup.get(value) ?? value.replace(/_/g, ' ')
}

export function formatPropertyRelationship(value?: string | null) {
  if (!value) return ''
  return relationshipLookup.get(value) ?? value
}
