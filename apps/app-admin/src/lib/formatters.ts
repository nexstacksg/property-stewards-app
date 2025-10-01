export function formatSingaporeDate(value: Date | string | null | undefined): string {
  if (!value) return "N/A"
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return "N/A"

  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) {
    date.setUTCHours(12)
  }

  return date.toLocaleDateString("en-SG", {
    dateStyle: "medium",
    timeZone: "Asia/Singapore",
  })
}

export function formatCurrency(amount: number | string | null | undefined): string {
  const value = typeof amount === "string" ? Number(amount) : amount
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "SGD 0.00"
  }

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(value)
}

export function getContractStatusVariant(status: string): string {
  switch (status) {
    case "DRAFT":
      return "outline"
    case "CONFIRMED":
      return "secondary"
    case "SCHEDULED":
      return "info"
    case "COMPLETED":
      return "success"
    case "TERMINATED":
      return "default"
    case "CANCELLED":
      return "destructive"
    default:
      return "default"
  }
}
