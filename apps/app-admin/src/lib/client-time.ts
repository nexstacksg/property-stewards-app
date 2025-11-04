// Client-side helpers to treat entered dates/times as business timezone wall time
// Defaults to Asia/Singapore (UTC+08:00) with no DST.

export const BUSINESS_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Singapore'
// Store as minutes east of UTC (e.g., 480 for UTC+8)
const BUSINESS_TZ_OFFSET_MINUTES = Number(process.env.NEXT_PUBLIC_APP_TZ_OFFSET_MINUTES ?? 480)

// Build an ISO string representing the instant that corresponds to the given
// wall time in the business timezone (e.g., 09:00 in Asia/Singapore).
export function toBusinessZonedISOString(dateStr: string, timeStr: string): string {
  // Construct a Date in the user's local timezone first
  const local = new Date(`${dateStr}T${timeStr}:00`)
  // Desired offset in the same sign convention as getTimezoneOffset() (minutes)
  const desiredOffset = -BUSINESS_TZ_OFFSET_MINUTES // e.g., -480 for UTC+8
  // JS getTimezoneOffset() returns minutes to add to local to get UTC
  // Example: Bangkok (UTC+7) => -420, Singapore (UTC+8) => -480
  const deltaMinutes = local.getTimezoneOffset() - desiredOffset
  const adjusted = new Date(local.getTime() - deltaMinutes * 60_000)
  return adjusted.toISOString()
}

// Convert an instant (ISO string) to date and time strings in the business timezone.
export function fromInstantToBusinessDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = dtf.formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
}

