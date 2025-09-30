export function sanitizeSegment(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildWorkOrderReportFilename(
  customerName?: string | null,
  postalCode?: string | null,
  fallback?: string
) {
  const parts = [sanitizeSegment(customerName), sanitizeSegment(postalCode)].filter(Boolean)
  const base = parts.length > 0
    ? `work-order-${parts.join("-")}`
    : fallback
      ? sanitizeSegment(fallback)
      : "work-order-report"

  return `${base || "work-order-report"}.pdf`
}

export function buildContractReportFilename(
  customerName?: string | null,
  postalCode?: string | null,
  fallback?: string
) {
  const parts = [sanitizeSegment(customerName), sanitizeSegment(postalCode)].filter(Boolean)
  const base = parts.length > 0
    ? `contract-${parts.join("-")}`
    : fallback
      ? `contract-${sanitizeSegment(fallback)}`
      : "contract-report"

  return `${base || "contract-report"}.pdf`
}
