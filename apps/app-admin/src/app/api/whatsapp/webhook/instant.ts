import { sendWhatsAppResponse } from './utils'

export type InstantController = {
  schedule: (message: string) => void
  beforeFinal: () => Promise<void>
}

export function createInstantController(phone: string): InstantController {
  const scheduleMs = process.env.WHATSAPP_INSTANT_SCHEDULE_MS
    ? Number(process.env.WHATSAPP_INSTANT_SCHEDULE_MS)
    : Math.max(0, Number(process.env.WHATSAPP_INSTANT_DELAY_MS ?? 150))
  const leadMs = Number(process.env.WHATSAPP_INSTANT_LEAD_MS ?? 450)

  let timer: NodeJS.Timeout | null = null
  let promise: Promise<void> | null = null
  let sent = false
  let inFlight = false
  let cancelled = false

  const schedule = (message: string) => {
    if (!message) return
    promise = new Promise<void>((resolve) => {
      timer = setTimeout(async () => {
        if (cancelled) return resolve()
        try {
          inFlight = true
          await sendWhatsAppResponse(phone, message)
          sent = true
          if (leadMs > 0) {
            await new Promise(r => setTimeout(r, leadMs))
          }
        } catch (error) {
          console.error('⚠️ Failed to send instant acknowledgement:', error)
        } finally {
          inFlight = false
          resolve()
        }
      }, Math.max(0, scheduleMs))
    })
  }

  const beforeFinal = async () => {
    if (!sent && !inFlight) {
      if (timer) clearTimeout(timer)
      cancelled = true
      return
    }
    if (promise) {
      try { await promise } catch {}
    }
  }

  return { schedule, beforeFinal }
}

