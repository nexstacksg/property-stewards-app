// Utilities for consistent server-side date formatting with a fixed timezone
// Configure via APP_TIMEZONE in your environment (e.g., Asia/Singapore or Asia/Bangkok).

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Singapore'

export function formatDateLocal(value: Date | string | null | undefined): string {
  if (!value) return 'N/A'
  try {
    return new Date(value).toLocaleDateString('en-SG', {
      dateStyle: 'medium',
      timeZone: APP_TIMEZONE,
    })
  } catch {
    return 'N/A'
  }
}

export function formatDateTimeLocal(value: Date | string | null | undefined): string {
  if (!value) return 'N/A'
  try {
    return new Date(value).toLocaleString('en-SG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: APP_TIMEZONE,
    })
  } catch {
    return 'N/A'
  }
}

