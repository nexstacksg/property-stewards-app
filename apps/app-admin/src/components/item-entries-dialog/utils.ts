export const CONDITION_OPTIONS = [
  { value: "", label: "Select condition" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "UNSATISFACTORY", label: "Un-Satisfactory" },
  { value: "UN_OBSERVABLE", label: "Un-Observable" },
  { value: "NOT_APPLICABLE", label: "Not Applicable" }
]

export function formatCondition(value?: string | null) {
  if (!value) return null
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function buildMediaLabel(itemName?: string, context?: string | null) {
  if (!itemName) return context || "Checklist item remark"
  if (!context) return itemName
  return `${itemName} — ${context}`
}

