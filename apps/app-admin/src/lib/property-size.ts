import { PropertySize } from '@prisma/client'

const PROPERTY_SIZE_VALUES = new Set(Object.values(PropertySize))

const ALIAS_ENTRIES: Array<[string, PropertySize]> = [
  ['1_ROOM', PropertySize.HDB_1_ROOM],
  ['2_ROOM', PropertySize.HDB_2_ROOM],
  ['3_ROOM', PropertySize.HDB_3_ROOM],
  ['4_ROOM', PropertySize.HDB_4_ROOM],
  ['5_ROOM', PropertySize.HDB_5_ROOM],
  ['EXECUTIVE', PropertySize.HDB_EXECUTIVE],
  ['JUMBO', PropertySize.HDB_JUMBO],
  ['1BR', PropertySize.ONE_BEDROOM],
  ['2BR', PropertySize.TWO_BEDROOM],
  ['3BR', PropertySize.THREE_BEDROOM],
  ['4BR', PropertySize.FOUR_BEDROOM],
  ['1_BEDROOM', PropertySize.ONE_BEDROOM],
  ['2_BEDROOM', PropertySize.TWO_BEDROOM],
  ['3_BEDROOM', PropertySize.THREE_BEDROOM],
  ['4_BEDROOM', PropertySize.FOUR_BEDROOM],
  ['GOOD_CLASS', PropertySize.GOOD_CLASS_BUNGALOW],
  ['GCB', PropertySize.GOOD_CLASS_BUNGALOW],
]

const ALIAS_MAP = new Map<string, PropertySize>(
  ALIAS_ENTRIES.map(([code, value]) => [normaliseKey(code), value])
)

const HDB_NUMERIC_SIZE = /^\d_ROOM$/

const LANDED_FALLBACK = new Map<string, PropertySize>([
  ['GCB', PropertySize.GOOD_CLASS_BUNGALOW],
  ['GOOD_CLASS', PropertySize.GOOD_CLASS_BUNGALOW],
  ['GOOD_CLASS_BUNGALOW', PropertySize.GOOD_CLASS_BUNGALOW],
])

function normaliseKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/_+/g, '_')
}

export function normalizePropertySize(propertyType: string | null | undefined, size: string): PropertySize {
  if (!size) {
    throw new Error('Missing property size')
  }

  const raw = String(size)
  const normalised = normaliseKey(raw)

  if (PROPERTY_SIZE_VALUES.has(normalised as PropertySize)) {
    return normalised as PropertySize
  }

  const aliasMatch = ALIAS_MAP.get(normalised)
  if (aliasMatch) {
    return aliasMatch
  }

  const propertyKey = typeof propertyType === 'string' ? normaliseKey(propertyType) : ''

  if (propertyKey === 'HDB' && HDB_NUMERIC_SIZE.test(normalised)) {
    const candidate = `HDB_${normalised}`
    if (PROPERTY_SIZE_VALUES.has(candidate as PropertySize)) {
      return candidate as PropertySize
    }
  }

  if (propertyKey === 'LANDED') {
    const landedMatch = LANDED_FALLBACK.get(normalised)
    if (landedMatch) {
      return landedMatch
    }
  }

  throw new Error(`Unsupported property size value "${raw}" for property type "${propertyType ?? 'UNKNOWN'}"`)
}
