import OpenAI from 'openai'
// chat-session not required for responses flow here; session state used elsewhere
import { cacheGetJSON, cacheSetJSON } from '@/lib/memcache'
import { assistantTools, executeTool } from './tools'
import type { ChatSessionState } from '@/lib/chat-session'
import { INSTRUCTIONS } from '@/app/api/assistant-instructions'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import { getInspectorByPhone } from '@/lib/services/inspectorService'

const debugLog = (...args: unknown[]) => {
  const on = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
  if (on === 'true' || on === 'verbose') console.log('[wh-openai]', ...args)
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Conversation history stored in Memcache per phone
type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string }
const HISTORY_KEY = (phone: string) => `wh:conv:${phone}`
const HISTORY_TTL = Number(process.env.WHATSAPP_HISTORY_TTL ?? 7 * 24 * 60 * 60) // 7 days

async function loadHistory(phone: string): Promise<ChatMessage[]> {
  try { return (await cacheGetJSON<ChatMessage[]>(HISTORY_KEY(phone))) || [] } catch { return [] }
}
async function saveHistory(phone: string, messages: ChatMessage[]) {
  // Trim history to a small, WhatsApp-friendly maximum to reduce token usage
  const cap = Number(process.env.WHATSAPP_HISTORY_MAX ?? 8)
  const trimmed = messages.slice(-cap)
  try { await cacheSetJSON(HISTORY_KEY(phone), trimmed, { ttlSeconds: HISTORY_TTL }) } catch {}
}

function selectToolNames(meta: ChatSessionState | null | undefined): string[] {
  const base = new Set<string>([
    'collectInspectorInfo',
    'getTodayJobs',
    'confirmJobSelection',
    'startJob',
    'updateJobDetails'
  ])

  if (!meta) return Array.from(base)

  const last = meta.lastMenu
  const started = meta.jobStatus === 'started'

  if (last === 'jobs' || meta.jobStatus === 'none') {
    base.add('getTodayJobs')
    base.add('confirmJobSelection')
    base.add('updateJobDetails')
    base.add('startJob')
  }

  if (started || last === 'locations' || last === 'sublocations' || last === 'tasks') {
    base.add('getJobLocations')
    base.add('getSubLocations')
    base.add('getTasksForLocation')
    base.add('getLocationMedia')
    base.add('getTaskMedia')
    base.add('markLocationComplete')
  }

  // Sub-location (Level 2) flow
  if (meta.currentSubLocationId) {
    base.add('setSubLocationConditions')
    base.add('setSubLocationCauseResolution')
    base.add('setSubLocationRemarks')
    base.add('markSubLocationComplete')
  } else {
    // Per-task flow for locations without sub-locations
    base.add('completeTask')
  }

  return Array.from(base)
}

function filterToolsByNames(names: string[]) {
  const set = new Set(names)
  return (assistantTools as any[]).filter((t: any) => t?.function?.name && set.has(t.function.name))
}

// Legacy compatibility no-ops
export function getCachedThreadId(phone: string) { return phone }
export async function postAssistantMessageIfThread(phone: string, content: string) {
  const hist = await loadHistory(phone)
  hist.push({ role: 'assistant', content })
  await saveHistory(phone, hist)
}

export async function processWithAssistant(phoneNumber: string, message: string): Promise<string> {
  try {
    const perfOn = (process.env.WHATSAPP_PERF_LOG || '').toLowerCase() === 'true'
    const perfEvents: Array<{ name: string; ms: number }> = []
    const timeIt = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now()
      try { return await fn() } finally { if (perfOn) perfEvents.push({ name, ms: Date.now() - t0 }) }
    }
    debugLog('start', { phoneNumber, len: message?.length })
    const model = (process.env.WHATSAPP_ASSISTANT_MODEL || 'gpt-5-nano').trim()

    // Minimal stateful guard: when the user is in a strict step, translate
    // the message directly into the corresponding tool call to keep session
    // in sync and avoid the model skipping steps (e.g., asking for media early).
    try {
      const meta = await getSessionState(phoneNumber)
      const raw = (message || '').trim()
      // Parse numeric input: any 1–2 digit for list selections; 1–5 for condition only
      const numAny = /^\s*(\d{1,2})\s*$/.exec(raw)
      const num1to5 = /^\s*([1-5])\s*$/.exec(raw)
      const lower = raw.toLowerCase()
      const dbg = (...a: any[]) => { if ((process.env.WHATSAPP_DEBUG || '').toLowerCase() !== 'false') console.log('[wh-guard]', ...a) }

      // Jobs intent detection (reset context and list today's jobs first)
      const isJobsIntent = (() => {
        if (!lower) return false
        const keywords = [
          'jobs', 'job', 'tasks', 'task', 'my tasks', 'schedule', 'today', 'my jobs', 'my schedule',
          'work order', 'work orders', 'inspections', 'inspection', 'assignments', 'appointments',
          'show jobs', 'show schedule', 'list jobs', 'what are my jobs', "what's my schedule","Hi","Hey","Hello"
        ]
        if (keywords.some(k => lower === k || lower.includes(k))) return true
        if (/today'?s?\s+(jobs?|tasks?|schedule|inspections?|work\s*orders?)/.test(lower)) return true
        if (/(what('?s)?|show)\s+(my\s+)?(jobs?|tasks?|schedule|inspections?)/.test(lower)) return true
        return false
      })()

      if (isJobsIntent) {
        dbg('intent:jobs → reset context and list')
        const inspectorIdHint = meta?.inspectorId
        const inspectorPhoneHint = meta?.inspectorPhone || phoneNumber
        try {
          await updateSessionState(phoneNumber, {
            jobStatus: 'none',
            workOrderId: undefined,
            customerName: undefined,
            propertyAddress: undefined,
            postalCode: undefined,
            currentLocation: undefined,
            currentLocationId: undefined,
            currentSubLocationId: undefined,
            currentSubLocationName: undefined,
            currentItemId: undefined,
            currentTaskId: undefined,
            currentTaskName: undefined,
            currentTaskItemId: undefined,
            currentTaskEntryId: undefined,
            currentTaskCondition: undefined,
            currentTaskLocationId: undefined,
            currentTaskLocationName: undefined,
            currentLocationCondition: undefined,
            taskFlowStage: undefined,
            pendingTaskRemarks: undefined,
            pendingTaskCause: undefined,
            pendingTaskResolution: undefined,
            locationSubLocations: undefined,
            lastMenu: 'jobs',
            lastMenuAt: new Date().toISOString(),
          })
        } catch {}
        const t0 = Date.now()
        const res = await executeTool(
          'getTodayJobs',
          inspectorIdHint ? { inspectorId: inspectorIdHint, reset: true } : { inspectorPhone: inspectorPhoneHint, reset: true },
          undefined,
          phoneNumber
        )
        dbg('tool:getTodayJobs (guard) done in', Date.now() - t0, 'ms')
        let data: any = null
        try { data = JSON.parse(res) } catch {}
        if (data && data.identifyRequired) {
          return [
            'Hello! To assign you today\'s inspection jobs, I need your details. Please provide:',
            '  [1] Your full name',
            '  [2] Your phone number (with country code, e.g., +65 for Singapore)',
            '',
            'Send in the format: Name, +CountryCodeNumber (e.g., Ken, +6591234567)'
          ].join('\n')
        }
        const jobs = Array.isArray(data?.jobs) ? data.jobs : []
        const latest = await getSessionState(phoneNumber)
        const inspectorName = latest.inspectorName || ''
        if (jobs.length === 0) {
          return `Hi${inspectorName ? ' ' + inspectorName : ''}! You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.`
        }
        const lines: string[] = []
        lines.push(`Hi${inspectorName ? ' ' + inspectorName : ''}! Here are your jobs for today:`)
        for (const j of jobs) {
          lines.push('')
          lines.push(`${j.selectionNumber}`)
          lines.push(`🏠 Property: ${j.property}`)
          lines.push(`⏰ Time: ${j.time}`)
          lines.push(`  👤 Customer: ${j.customer}`)
          lines.push(`  ⭐ Priority: ${j.priority}`)
          lines.push(`  Status: ${j.status}`)
          lines.push('---')
        }
        lines.push(`Type ${jobs.map((j: any) => j.selectionNumber).join(', ')} to select a job.`)
        return lines.join('\n')
      }

      // Job confirmation + edit-menu guard
      if (meta?.jobStatus === 'confirming' && meta?.workOrderId) {
        // 1) If currently in the job edit menu, map numeric options
        if (meta.jobEditMode === 'menu' && numAny) {
          const pick = Number(numAny[1])
          // [1] Different job selection → list today's jobs and exit confirm flow
          if (pick === 1) {
            dbg('job-edit [1] → different job selection; listing today jobs')
            try { await updateSessionState(phoneNumber, { jobEditMode: undefined, jobEditType: undefined, jobStatus: 'none', lastMenu: 'jobs', lastMenuAt: new Date().toISOString() }) } catch {}
            const idHint = meta.inspectorId
            const res = await executeTool('getTodayJobs', idHint ? { inspectorId: idHint, reset: true } : { inspectorPhone: phoneNumber, reset: true }, undefined, phoneNumber)
            let data: any = null; try { data = JSON.parse(res) } catch {}
            const jobs = Array.isArray(data?.jobs) ? data.jobs : []
            if (jobs.length === 0) return 'Hi! You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.'
            const lines: string[] = []
            const latest = await getSessionState(phoneNumber)
            const inspectorName = latest.inspectorName || ''
            lines.push(`Hi${inspectorName ? ' ' + inspectorName : ''}! Here are your jobs for today:`)
            for (const j of jobs) {
              lines.push('')
              lines.push(`${j.selectionNumber}`)
              lines.push(`🏠 Property: ${j.property}`)
              lines.push(`⏰ Time: ${j.time}`)
              lines.push(`  👤 Customer: ${j.customer}`)
              lines.push(`  ⭐ Priority: ${j.priority}`)
              lines.push(`  Status: ${j.status}`)
              lines.push('---')
            }
            lines.push(`Type ${jobs.map((j: any) => j.selectionNumber).join(', ')} to select a job.`)
            return lines.join('\n')
          }
          // [2]-[5] enter await_value for the specific field
          if (pick >= 2 && pick <= 5) {
            const type = (pick === 2 ? 'customer' : pick === 3 ? 'address' : pick === 4 ? 'time' : 'status') as 'customer'|'address'|'time'|'status'
            try { await updateSessionState(phoneNumber, { jobEditMode: 'await_value', jobEditType: type }) } catch {}
            const prompts: Record<string, string> = {
              customer: 'Please provide the new customer name.',
              address: 'Please provide the new address (you can include postal after a comma).',
              time: 'Please provide the new time (e.g., 14:30 or 2:30 pm).',
              status: 'Please provide the new status (SCHEDULED/STARTED/CANCELLED/COMPLETED).'
            }
            return prompts[type]
          }
        }

        // 2) If awaiting a value for job update, treat any non-numeric input as the new value
        if (meta.jobEditMode === 'await_value' && meta.jobEditType && raw && !numAny) {
          const type = meta.jobEditType
          dbg('job-edit await_value → updateJobDetails', { type })
          const out = await executeTool('updateJobDetails', { jobId: meta.workOrderId, updateType: type, newValue: raw }, undefined, phoneNumber)
          let data: any = null; try { data = JSON.parse(out) } catch {}
          try { await updateSessionState(phoneNumber, { jobEditMode: undefined, jobEditType: undefined }) } catch {}
          // Re-show single confirmation
          const cRes = await executeTool('confirmJobSelection', { jobId: meta.workOrderId }, undefined, phoneNumber)
          let cData: any = null; try { cData = JSON.parse(cRes) } catch {}
          const lines: string[] = []
          lines.push('Please confirm the destination details before starting the inspection:')
          lines.push('')
          lines.push(`🏠 Property: ${cData?.jobDetails?.property}`)
          lines.push(`⏰ Time: ${cData?.jobDetails?.time}`)
          lines.push(`👤 Customer: ${cData?.jobDetails?.customer}`)
          lines.push(`Status: ${cData?.jobDetails?.status}`)
          lines.push('')
          lines.push('[1] Yes')
          lines.push('[2] No')
          lines.push('')
          lines.push('Next: reply [1] to confirm or [2] to pick another job.')
          return lines.join('\n')
        }

        // 3) Default confirm menu handling
        if (raw === '1' || lower === 'yes' || lower === 'y') {
          dbg('confirm yes → startJob', { workOrderId: meta.workOrderId })
          const res = await executeTool('startJob', { jobId: meta.workOrderId }, undefined, phoneNumber)
          try {
            const data = JSON.parse(res)
            const locs: string[] = data?.locationsFormatted || []
            if (Array.isArray(locs) && locs.length > 0) {
              const lines: string[] = []
              lines.push('The job has been successfully started! Here are the locations available for inspection:')
              lines.push('')
              for (const l of locs) lines.push(l)
              lines.push('')
              lines.push('Next: reply with the location number (e.g., [1], [2], etc.).')
              return lines.join('\\n')
            }
          } catch {}
          return res
        }
        if (raw === '2' || lower === 'no' || lower === 'n') {
          dbg('confirm no → edit menu')
          try { await updateSessionState(phoneNumber, { jobEditMode: 'menu', jobEditType: undefined }) } catch {}
          return [
            'What would you like to change about the job? Here are some options:',
            '',
            '[1] Different job selection',
            '[2] Customer name update',
            '[3] Property address change',
            '[4] Time rescheduling',
            '[5] Work order status change (SCHEDULED/STARTED/CANCELLED/COMPLETED)',
            '',
            'Next: reply [1-5] with your choice.'
          ].join('\\n')
        }
      }
      // Jobs intent guard: reset inspection context then list today's jobs
      // const jobsIntent = (() => {
      //   const t = lower
      //   if (!t) return false
      //   const keywords = ['jobs', 'job', 'tasks', 'task', 'my tasks', 'schedule', 'today', 'my jobs', 'my schedule', 'work order', 'work orders', 'inspections', 'inspection', 'assignments', 'appointments']
      //   if (keywords.some(k => t === k || t.includes(k))) return true
      //   if (/today'?s?\s+(jobs?|tasks?|schedule|inspections?|work\s*orders?)/.test(t)) return true
      //   if (/(what('?s)?|show)\s+(my\s+)?(jobs?|tasks?|schedule|inspections?)/.test(t)) return true
      //   return false
      // })()
      // if (jobsIntent) {
      //   dbg('intent:jobs → list without resetting context')
      //   try {
      //     await updateSessionState(phoneNumber, {
      //       lastMenu: 'jobs',
      //       lastMenuAt: new Date().toISOString(),
      //     })
      //   } catch {}
      //   const res = await executeTool('getTodayJobs', { inspectorPhone: phoneNumber }, undefined, phoneNumber)
      //   let data: any = null
      //   try { data = JSON.parse(res) } catch {}
      //   const jobs = Array.isArray(data?.jobs) ? data.jobs : []
      //   const s = await getSessionState(phoneNumber)
      //   const inspectorName = s.inspectorName || ''
      //   if (jobs.length === 0) return `Hi${inspectorName ? ' ' + inspectorName : ''}! You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.`
      //   const lines: string[] = []
      //   lines.push(`Hi${inspectorName ? ' ' + inspectorName : ''}! Here are your jobs for today:`)
      //   for (const j of jobs) {
      //     lines.push('')
      //     lines.push(`${j.selectionNumber}`)
      //     lines.push(`🏠 Property: ${j.property}`)
      //     lines.push(`⏰ Time: ${j.time}`)
      //     lines.push(`  👤 Customer: ${j.customer}`)
      //     lines.push(`  ⭐ Priority: ${j.priority}`)
      //     lines.push(`  Status: ${j.status}`)
      //     lines.push('---')
      //   }
      //   lines.push(`Type ${jobs.map((j: any) => j.selectionNumber).join(', ')} to select a job.`)
      //   return lines.join('\n')
      // }
    

      // Numeric job selection when jobs list is on screen
      if (numAny && meta?.lastMenu === 'jobs') {
        const pick = Number(numAny[1])
        dbg('jobs-select', { pick })
        const res = await executeTool('getTodayJobs', { inspectorId: meta?.inspectorId || undefined, inspectorPhone: meta?.inspectorPhone || phoneNumber }, undefined, phoneNumber)
        let data: any = null
        try { data = JSON.parse(res) } catch {}
        const jobs = Array.isArray(data?.jobs) ? data.jobs : []
        if (!jobs || jobs.length === 0) {
          return 'Hi! You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.'
        }
        if (pick < 1 || pick > jobs.length) {
          const options = jobs.map((j: any) => j.selectionNumber).join(', ')
          return `That job number isn't valid. Type ${options} to select a job.`
        }
        const chosen = jobs[pick - 1]
        const cRes = await executeTool('confirmJobSelection', { jobId: chosen.id }, undefined, phoneNumber)
        let cData: any = null
        try { cData = JSON.parse(cRes) } catch {}
        if (!cData?.success) return 'There was an issue loading that job. Please try again.'
        const lines: string[] = []
        lines.push('Please confirm the destination details before starting the inspection:')
        lines.push('')
        lines.push(`🏠 Property: ${cData.jobDetails?.property}`)
        lines.push(`⏰ Time: ${cData.jobDetails?.time}`)
        lines.push(`👤 Customer: ${cData.jobDetails?.customer}`)
        lines.push(`Status: ${cData.jobDetails?.status}`)
        lines.push('')
        lines.push('[1] Yes')
        lines.push('[2] No')
        lines.push('')
        lines.push('Next: reply [1] to confirm or [2] to pick another job.')
        return lines.join('\\n')
      }

      // Guard these steps as long as we have a workOrder context; location is not mandatory
      if (meta?.workOrderId) {
        // New sub-location bulk condition entry: when awaiting conditions, accept a single message with multiple values
        if (meta.taskFlowStage === 'condition' && meta.currentSubLocationId && raw) {
          const out = await executeTool('setSubLocationConditions', {
            workOrderId: meta.workOrderId,
            contractChecklistItemId: meta.currentLocationId,
            subLocationId: meta.currentSubLocationId,
            conditionsText: raw
          }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) {
            return data.message || 'Conditions updated. If any item is Fair or Un-Satisfactory, please provide the cause and resolution in ONE message (e.g., "1: <cause>, 2: <resolution>" or "Cause: ... Resolution: ..."). Otherwise, please enter the remarks for this sub-location.'
          }
          // If parsing failed, show helpful hint
          return 'I could not detect valid conditions. Please reply like "1 Good, 2 Good, 3 Fair" or "Good Good Fair".'
        }

        // Sub-location remarks capture: any non-numeric input while in remarks stage becomes remarks for the sub-location
        if (meta.taskFlowStage === 'remarks' && meta.currentSubLocationId && raw && !numAny) {
          const out = await executeTool('setSubLocationRemarks', {
            workOrderId: meta.workOrderId,
            contractChecklistItemId: meta.currentLocationId,
            subLocationId: meta.currentSubLocationId,
            subLocationName: meta.currentSubLocationName,
            remarks: raw
          }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) {
            return data.message || 'Remarks saved. Please provide photos/videos for this sub-location.'
          }
          return 'I could not save those remarks. Please try again.'
        }
        // Cause text (sub-location or per-task)
        if (meta.taskFlowStage === 'cause' && raw && !numAny) {
          if (meta.currentSubLocationId && !meta.currentTaskId) {
            // Try combined cause+resolution first
            // Try combined parsing first (supports "1: <cause>, 2: <resolution>" or labeled pairs)
            {
              const out = await executeTool('setSubLocationCauseResolution', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId, text: raw }, undefined, phoneNumber)
              let data: any = null
              try { data = JSON.parse(out) } catch {}
              if (data?.success) return data?.message || 'Thanks. Cause and resolution saved. Please enter the remarks for this sub-location.'
            }
            const out = await executeTool('setSubLocationCause', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId, cause: raw }, undefined, phoneNumber)
            let data: any = null
            try { data = JSON.parse(out) } catch {}
            if (data?.success) return data?.message || 'Thanks. Please provide the resolution (you can also send both in one message as "1: <cause>, 2: <resolution>" or "Cause: ... Resolution: ...").'
          } else {
            const out = await executeTool('completeTask', { phase: 'set_cause', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, cause: raw }, undefined, phoneNumber)
            let data: any = null
            try { data = JSON.parse(out) } catch {}
            if (data?.success) return data?.message || 'Thanks. Please provide the resolution.'
          }
        }
        // Resolution text (sub-location or per-task)
        if (meta.taskFlowStage === 'resolution' && raw && !numAny) {
          if (meta.currentSubLocationId && !meta.currentTaskId) {
            // Try combined first (supports numeric or labeled pairs)
            {
              const both = await executeTool('setSubLocationCauseResolution', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId, text: raw }, undefined, phoneNumber)
              let j: any = null
              try { j = JSON.parse(both) } catch {}
              if (j?.success) return j?.message || 'Thanks. Cause and resolution saved. Please enter the remarks for this sub-location.'
            }
            const out = await executeTool('setSubLocationResolution', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId, resolution: raw }, undefined, phoneNumber)
            let data: any = null
            try { data = JSON.parse(out) } catch {}
            if (data?.success) return data?.message || 'Resolution saved. Please enter the remarks for this sub-location.'
          } else {
            const out = await executeTool('completeTask', { phase: 'set_resolution', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, resolution: raw }, undefined, phoneNumber)
            let data: any = null
            try { data = JSON.parse(out) } catch {}
            if (data?.success) {
              const c = String(meta.currentTaskCondition || '').toUpperCase()
              const allowSkip = c === 'NOT_APPLICABLE'
              return data?.message || (allowSkip
                ? 'Resolution saved. Please add remarks for this task (or type "skip").'
                : 'Resolution saved. Please add remarks for this task.')
            }
          }
        }
        // Media stage skip (task flow only)
        if (meta.taskFlowStage === 'media' && meta.currentTaskId && (lower === 'skip' || lower === 'no')) {
          const cond = String(meta.currentTaskCondition || '').toUpperCase()
          if (cond !== 'NOT_APPLICABLE') {
            return 'Media is required for this condition. Please send at least one photo (you can add remarks as a caption).'
          }
          const out = await executeTool('completeTask', { phase: 'skip_media', workOrderId: meta.workOrderId, taskId: meta.currentTaskId }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) return data?.message || 'Okay, skipping media for this Not Applicable condition. Reply [1] if this task is complete, [2] otherwise.'
        }
        // Sub-location media confirmation: [1] complete sub-location, [2] keep adding
        if (meta.taskFlowStage === 'media' && meta.currentSubLocationId && !meta.currentTaskId && numAny) {
          const pick = Number(numAny[1])
          if (pick === 1) {
            const r = await executeTool('markSubLocationComplete', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId }, undefined, phoneNumber)
            let rr: any = null; try { rr = JSON.parse(r) } catch {}
            const formatted: string[] = Array.isArray(rr?.subLocationsFormatted) ? rr.subLocationsFormatted : []
            const header = `Here are the available sub-locations${meta.currentLocation ? ` in ${meta.currentLocation}` : ''}:`
            try { await updateSessionState(phoneNumber, { lastMenu: 'sublocations', lastMenuAt: new Date().toISOString(), currentSubLocationId: undefined, currentSubLocationName: undefined }) } catch {}
            const parts: string[] = []
            if (rr?.message) parts.push(rr.message, '')
            parts.push(header, '', ...formatted)
            if (formatted.length > 0) parts.push('', `Next: reply with your sub-location choice, or [${formatted.length + 1}] to go back.`)
            return parts.join('\\n')
          }
          if (pick === 2) {
            return 'Okay — you can send more photos/videos for this area when you are ready.'
          }
        }
        // Remarks step (new): free text remarks before media
        if (meta.taskFlowStage === 'remarks' && raw && !numAny) {
          const out = await executeTool('completeTask', { phase: 'set_remarks', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, remarks: raw }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) return data?.message || 'Thanks. Please send any photos/videos now (captions will be saved per media), or type "skip" to continue.'
        }

        // Finalize confirmation step: [1] complete, [2] not yet (task flow only)
        if (numAny && meta.taskFlowStage === 'confirm' && meta.currentTaskId) {
          const pick = Number(numAny[1])
          if (pick === 1 || pick === 2) {
            dbg('finalize → completeTask', { completed: pick === 1 })
            const finalize = await executeTool('completeTask', { phase: 'finalize', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, completed: pick === 1 }, undefined, phoneNumber)
            let f: any = null
            try { f = JSON.parse(finalize) } catch {}
            if (!f?.success && typeof f?.error === 'string') {
              return `${f.error}\n\nNext: send the required media or add a remark, or type 'skip' to continue without media.`
            }
            // Refresh tasks list to show updated state
            const tasksRes = await executeTool('getTasksForLocation', { workOrderId: meta.workOrderId, location: meta.currentLocation, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId }, undefined, phoneNumber)
            let data: any = null
            try { data = JSON.parse(tasksRes) } catch {}
            const tasks = Array.isArray(data?.tasks) ? data.tasks : []
            const locName = meta.currentTaskLocationName || meta.currentSubLocationName || meta.currentLocation || 'this location'
            const lines: string[] = []
            lines.push(`In ${locName}, here are the tasks available for inspection:`)
            lines.push('')
            for (const t of tasks) {
              const status = String(t?.displayStatus || '').toLowerCase() === 'done' ? ' (Done)' : ''
              lines.push(`[${t.number}] ${t.description}${status}`)
            }
            lines.push(`[${tasks.length + 1}] Go back`)
            lines.push('')
            lines.push(`Next: reply with the task number to continue, or [${tasks.length + 1}] to go back.`)
            const header = (f?.message && typeof f.message === 'string') ? f.message : null
            return header ? `${header}\n\n${lines.join('\n')}` : lines.join('\n')
          }
        }

        // Location selection: numeric reply while viewing locations list
        if (numAny && meta.lastMenu === 'locations') {
          const pick = Number(numAny[1])
          dbg('locations-select', { pick })
          const locRes = await executeTool('getJobLocations', { jobId: meta.workOrderId }, undefined, phoneNumber)
          let locData: any = null
          try { locData = JSON.parse(locRes) } catch {}
          const list = Array.isArray(locData?.locations) ? locData.locations : []
          if (!list || list.length === 0) {
            return 'No locations were found for this job. Please try refreshing your jobs.'
          }
          if (pick < 1 || pick > list.length) {
            const options = (locData?.locationsFormatted || []).join('\n')
            return `That location number isn't valid.\n\n${options}\n\nNext: reply with the number of the location you want to inspect.`
          }
          const chosen = list[pick - 1]
          // Proactively update session with the chosen location to avoid stale context
          try {
            await updateSessionState(phoneNumber, {
              currentLocation: chosen?.name,
              currentLocationId: chosen?.contractChecklistItemId,
              currentSubLocationId: undefined,
              currentSubLocationName: undefined,
              lastMenu: 'locations',
              lastMenuAt: new Date().toISOString(),
              currentTaskId: undefined,
              currentTaskName: undefined,
              currentTaskEntryId: undefined,
              currentTaskCondition: undefined
            })
          } catch {}
          const hasSubs = Array.isArray(chosen?.subLocations) && chosen.subLocations.length > 0
          if (hasSubs) {
            const subRes = await executeTool('getSubLocations', { workOrderId: meta.workOrderId, contractChecklistItemId: chosen.contractChecklistItemId, locationName: chosen.name }, undefined, phoneNumber)
            let subData: any = null
            try { subData = JSON.parse(subRes) } catch {}
            const formatted: string[] = subData?.subLocationsFormatted || []
            if (!formatted.length) {
              const tasksRes = await executeTool('getTasksForLocation', { workOrderId: meta.workOrderId, location: chosen.name, contractChecklistItemId: chosen.contractChecklistItemId }, undefined, phoneNumber)
              let data: any = null
              try { data = JSON.parse(tasksRes) } catch {}
              const tasks = Array.isArray(data?.tasks) ? data.tasks : []
              if (tasks.length === 0) return 'No tasks found for this location.'
              const lines: string[] = []
              lines.push(`In ${chosen.name}, here are the tasks available for inspection:`)
              lines.push('')
              for (const t of tasks) {
                const status = String(t?.displayStatus || '').toLowerCase() === 'done' ? ' (Done)' : ''
                lines.push(`[${t.number}] ${t.description}${status}`)
              }
              lines.push(`[${tasks.length + 1}] Go back`)
              lines.push('')
              lines.push(`Next: reply with the task number to continue, or [${tasks.length + 1}] to go back.`)
              return lines.join('\n')
            }
            const header = `You've selected ${chosen.name}. Here are the available sub-locations:`
            const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
            return [header, '', ...withBack, '', `Next: reply with your sub-location choice, or [${withBack.length}] to go back.`].join('\n')
          }
          // No sub-locations → show tasks directly
          const tasksRes = await executeTool('getTasksForLocation', { workOrderId: meta.workOrderId, location: chosen.name, contractChecklistItemId: chosen.contractChecklistItemId }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(tasksRes) } catch {}
          const tasks = Array.isArray(data?.tasks) ? data.tasks : []
          // Ensure lastMenu reflects tasks
          try {
            await updateSessionState(phoneNumber, {
              lastMenu: 'tasks',
              lastMenuAt: new Date().toISOString(),
            })
          } catch {}
          if (tasks.length === 0) return 'No tasks found for this location.'
          const lines: string[] = []
          lines.push(`In ${chosen.name}, here are the tasks available for inspection:`)
          lines.push('')
          for (const t of tasks) {
            const status = String(t?.displayStatus || '').toLowerCase() === 'done' ? ' (Done)' : ''
            lines.push(`[${t.number}] ${t.description}${status}`)
          }
          lines.push(`[${tasks.length + 1}] Go back`)
          lines.push('')
          lines.push(`Next: reply with the task number to continue, or [${tasks.length + 1}] to go back.`)
          return lines.join('\n')
        }

        // Sub-location selection: numeric reply while viewing sub-locations list
        if (numAny && (meta.lastMenu === 'sublocations' || (meta.workOrderId && meta.currentLocation && !meta.currentSubLocationId))) {
          const pick = Number(numAny[1])
          const latest = await getSessionState(phoneNumber)
          const itemId = latest.currentLocationId
          if (!itemId) {
            // Fallback: reload locations and let user re-pick
            const locRes = await executeTool('getJobLocations', { jobId: latest.workOrderId }, undefined, phoneNumber)
            let locData: any = null; try { locData = JSON.parse(locRes) } catch {}
            const formatted: string[] = Array.isArray(locData?.locationsFormatted) ? locData.locationsFormatted : []
            const header = 'Here are the locations available for inspection:'
            return [header, '', ...formatted, '', 'Next: reply with the location number to continue.'].join('\n')
          }
          // Resolve available sub-locations from cached mapping or tool
          let subs: Array<{ id: string; name: string; status: string }> | undefined
          const map = (latest as any).locationSubLocations as Record<string, Array<{ id: string; name: string; status: string }>> | undefined
          if (map && map[itemId]) subs = map[itemId]
          if (!subs) {
            const subRes = await executeTool('getSubLocations', { workOrderId: latest.workOrderId, contractChecklistItemId: itemId, locationName: latest.currentLocation }, undefined, phoneNumber)
            let subData: any = null; try { subData = JSON.parse(subRes) } catch {}
            subs = Array.isArray(subData?.subLocations) ? subData.subLocations : []
          }
          const options = Array.isArray(subs) ? subs : []
          if (options.length === 0) {
            // No sub-locations → show tasks directly
            const tasksRes = await executeTool('getTasksForLocation', { workOrderId: latest.workOrderId, location: latest.currentLocation, contractChecklistItemId: itemId }, undefined, phoneNumber)
            let data: any = null; try { data = JSON.parse(tasksRes) } catch {}
            const tasks = Array.isArray(data?.tasks) ? data.tasks : []
            if (tasks.length === 0) return 'No tasks found for this location.'
            const lines: string[] = []
            lines.push(`In ${latest.currentLocation}, here are the tasks available for inspection:`)
            lines.push('')
            for (const t of tasks) {
              const status = String(t?.displayStatus || '').toLowerCase() === 'done' ? ' (Done)' : ''
              lines.push(`[${t.number}] ${t.description}${status}`)
            }
            lines.push(`[${tasks.length + 1}] Go back`)
            lines.push('')
            lines.push(`Next: reply with the task number to continue, or [${tasks.length + 1}] to go back.`)
            try { await updateSessionState(phoneNumber, { lastMenu: 'tasks', lastMenuAt: new Date().toISOString() }) } catch {}
            return lines.join('\n')
          }
          const backNumber = options.length + 1
          if (pick === backNumber) {
            const locRes = await executeTool('getJobLocations', { jobId: latest.workOrderId }, undefined, phoneNumber)
            let locData: any = null; try { locData = JSON.parse(locRes) } catch {}
            const formatted: string[] = Array.isArray(locData?.locationsFormatted) ? locData.locationsFormatted : []
            const header = 'Here are the locations available for inspection:'
            try { await updateSessionState(phoneNumber, { lastMenu: 'locations', lastMenuAt: new Date().toISOString(), currentSubLocationId: undefined, currentSubLocationName: undefined }) } catch {}
            return [header, '', ...formatted, '', 'Next: reply with the location number to continue.'].join('\n')
          }
          if (pick < 1 || pick > backNumber) {
            const formatted = options.map((s, i) => `[${i + 1}] ${s.name}${s.status === 'completed' ? ' (Done)' : ''}`)
            const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
            return `That sub-location number isn't valid.\n\n${withBack.join('\n')}\n\nNext: reply with your sub-location choice, or [${withBack.length}] to go back.`
          }
          const chosenSub = options[pick - 1]
          // Persist selected sub-location to session and fetch tasks
          try {
            await updateSessionState(phoneNumber, { currentSubLocationId: chosenSub.id, currentSubLocationName: chosenSub.name })
          } catch {}
          const tasksRes = await executeTool('getTasksForLocation', { workOrderId: latest.workOrderId, location: latest.currentLocation, contractChecklistItemId: itemId, subLocationId: chosenSub.id }, undefined, phoneNumber)
          let data: any = null; try { data = JSON.parse(tasksRes) } catch {}
          const tasks = Array.isArray(data?.tasks) ? data.tasks : []
          if (tasks.length === 0) return 'No tasks found for this sub-location.'
          const lines: string[] = []
          lines.push(`Here are the checks for ${chosenSub.name}:`)
          lines.push('')
          for (const t of tasks) {
            const status = String(t?.displayStatus || '').toLowerCase() === 'done' ? ' (Done)' : ''
            lines.push(`[${t.number}] ${t.description}${status}`)
          }
          lines.push('')
          lines.push('Please reply in ONE message with the condition for each item in order. For example:')
          lines.push('• 1 Good, 2 Good, 3 Fair')
          lines.push('• or: Good Good Fair')
          lines.push('')
          lines.push('Allowed values: Good, Fair, Un-Satisfactory, Un-Observable, Not Applicable.')
          lines.push('You can send any natural phrasing; I will interpret each condition in order and update them one by one. You may omit any items you want to leave unset.')
          lines.push('')
          lines.push('Next: reply with your conditions now in one message.')
          try { await updateSessionState(phoneNumber, { lastMenu: 'tasks', lastMenuAt: new Date().toISOString(), taskFlowStage: 'condition' }) } catch {}
          return lines.join('\n')
        }

        // Numeric tasks selection mapping (lastMenu = tasks)
        const taskPick = /^\s*(\d{1,2})\s*$/.exec(raw)
        if (meta.lastMenu === 'tasks' && taskPick) {
          // In sub-location bulk condition mode, steer away from per-task selection
          if (meta.currentSubLocationId && meta.taskFlowStage === 'condition') {
            return [
              'Please reply in ONE message with the condition for each item in order, for example:',
              '1 Good, 2 Good, 3 Fair',
              'or: Good Good Fair',
              '',
              'Allowed values: Good, Fair, Un-Satisfactory, Un-Observable, Not Applicable.',
              'You can send any natural phrasing; I will interpret and update each condition in order. You may omit any items to leave them unset.'
            ].join('\\n')
          }
          const pick = Number(taskPick[1])
          dbg('tasks-select', { pick })
          const tasksRes = await executeTool('getTasksForLocation', { workOrderId: meta.workOrderId, location: meta.currentLocation, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(tasksRes) } catch {}
          const tasks = Array.isArray(data?.tasks) ? data.tasks : []
          const mc = data?.markCompleteNumber
          const gb = data?.goBackNumber
          if (mc && pick === mc) {
            dbg('tasks-select markComplete')
            const r = await executeTool('markLocationComplete', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId }, undefined, phoneNumber)
            let rr: any = null; try { rr = JSON.parse(r) } catch {}
            let formattedLocations: string[] = Array.isArray(rr?.locationsFormatted) ? rr.locationsFormatted : []
            if (!formattedLocations.length) {
              const locs = await executeTool('getJobLocations', { jobId: meta.workOrderId }, undefined, phoneNumber)
              let locData: any = null; try { locData = JSON.parse(locs) } catch {}
              formattedLocations = Array.isArray(locData?.locationsFormatted) ? locData.locationsFormatted : []
            }
            const header = 'Here are the locations available for inspection:'
            const body = formattedLocations.length > 0
              ? [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\\n')
              : 'Locations refreshed. Reply with the location number to continue.'
            return rr?.message ? `${rr.message}\\n\\n${body}` : body
          }
          if (gb && pick === gb) {
            dbg('tasks-select goBack (to locations)')
            // Always go back to job locations for a consistent UX and avoid raw JSON
            const locs = await executeTool('getJobLocations', { jobId: meta.workOrderId }, undefined, phoneNumber)
            let locData: any = null; try { locData = JSON.parse(locs) } catch {}
            const formattedLocations: string[] = Array.isArray(locData?.locationsFormatted) ? locData.locationsFormatted : []
            const header = 'Here are the locations available for inspection:'
            try {
              await updateSessionState(phoneNumber, {
                lastMenu: 'locations',
                lastMenuAt: new Date().toISOString(),
                currentTaskId: undefined,
                currentTaskName: undefined,
                currentTaskEntryId: undefined,
                currentTaskCondition: undefined,
                currentSubLocationId: undefined,
                currentSubLocationName: undefined
              })
            } catch {}
            return [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\\n')
          }
          if (tasks.length > 0 && pick >= 1 && pick <= tasks.length) {
            const chosen = tasks[pick - 1]
            dbg('tasks-select start', { taskId: chosen?.id })
            const start = await executeTool('completeTask', { phase: 'start', workOrderId: meta.workOrderId, taskId: chosen.id }, undefined, phoneNumber)
            let st: any = null; try { st = JSON.parse(start) } catch {}
            if (st?.success) {
              return [
                `Starting: ${chosen.description || 'Selected task'}`,
                '',
                'Set the condition for this task:',
                '[1] Good',
                '[2] Fair',
                '[3] Un-Satisfactory',
                '[4] Un-Observable',
                '[5] Not Applicable',
                '',
                'Next: reply 1–5 to set the condition.'
              ].join('\\n')
            }
            return 'There was an issue starting that task. Please pick a task again.'
          }
        }
      }
      // Fallback: random text while in a guided step → re-show current step
      if (!numAny && !isJobsIntent) {
        // If in condition stage
        if (meta?.taskFlowStage === 'condition') {
          if (meta?.currentSubLocationId) {
            return [
              "I didn't catch that. Please reply in ONE message with the condition for each item in order, e.g.",
              '1 Good, 2 Good, 3 Fair',
              'or',
              'Good Good Fair',
              '',
              'You can omit any numbers you wish to leave unset.'
            ].join('\n')
          }
          return [
            "I didn't understand that. Please set the condition:",
            '[1] Good',
            '[2] Fair',
            '[3] Un-Satisfactory',
            '[4] Un-Observable',
            '[5] Not Applicable',
            '',
            'Next: reply 1–5 with your selection.'
          ].join('\n')
        }
        // If awaiting cause/resolution text, keep their text; otherwise re-prompt
        if (meta?.taskFlowStage === 'cause') {
          return 'Please describe the cause for this issue (a short sentence is fine).'
        }
        if (meta?.taskFlowStage === 'resolution') {
          return 'Please describe the resolution (a short sentence is fine).'
        }
        // If in job confirmation
        if (meta?.jobStatus === 'confirming' || meta?.lastMenu === 'confirm') {
          try {
            const cRes = await executeTool('confirmJobSelection', { jobId: meta.workOrderId }, undefined, phoneNumber)
            let cData: any = null; try { cData = JSON.parse(cRes) } catch {}
            const lines: string[] = []
            lines.push("I didn't understand that. Please confirm the destination:")
            lines.push('')
            lines.push(`🏠 Property: ${cData?.jobDetails?.property}`)
            lines.push(`⏰ Time: ${cData?.jobDetails?.time}`)
            lines.push(`👤 Customer: ${cData?.jobDetails?.customer}`)
            lines.push(`Status: ${cData?.jobDetails?.status}`)
            lines.push('')
            lines.push('[1] Yes')
            lines.push('[2] No')
            lines.push('')
            lines.push('Next: reply [1] to confirm or [2] to pick another job.')
            return lines.join('\n')
          } catch {}
        }
        // If at locations
        if (meta?.lastMenu === 'locations' && meta?.workOrderId) {
          const locs = await executeTool('getJobLocations', { jobId: meta.workOrderId }, undefined, phoneNumber)
          let locData: any = null; try { locData = JSON.parse(locs) } catch {}
          const formatted: string[] = Array.isArray(locData?.locationsFormatted) ? locData.locationsFormatted : []
          const header = "I didn't understand that. Here are the locations available for inspection:"
          return [header, '', ...formatted, '', 'Next: reply with the location number to continue.'].join('\n')
        }
        // If at sub-locations
        if (meta?.lastMenu === 'sublocations' && meta?.currentLocationId) {
          const subRes = await executeTool('getSubLocations', { workOrderId: meta.workOrderId, contractChecklistItemId: meta.currentLocationId, locationName: meta.currentLocation }, undefined, phoneNumber)
          let subData: any = null; try { subData = JSON.parse(subRes) } catch {}
          const formatted: string[] = Array.isArray(subData?.subLocationsFormatted) ? subData.subLocationsFormatted : []
          const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
          return [`I didn't understand that. You've selected ${meta.currentLocation}. Here are the available sub-locations:`, '', ...withBack, '', `Next: reply with your sub-location choice, or [${withBack.length}] to go back.`].join('\n')
        }
        // If at tasks (new flow): remind about bulk condition input rather than per-task selection
        if (meta?.lastMenu === 'tasks' && meta?.currentLocationId) {
          const tasksRes = await executeTool('getTasksForLocation', { workOrderId: meta.workOrderId, location: meta.currentLocation, contractChecklistItemId: meta.currentLocationId, subLocationId: meta.currentSubLocationId }, undefined, phoneNumber)
          let data: any = null; try { data = JSON.parse(tasksRes) } catch {}
          const tasks = Array.isArray(data?.tasks) ? data.tasks : []
          const lines: string[] = []
          lines.push(`I didn't understand that. In ${meta.currentSubLocationName || meta.currentLocation || 'this location'}, here are the tasks:`)
          lines.push('')
          for (const t of tasks) {
            const status = String(t?.displayStatus || '').toLowerCase() === 'done' ? ' (Done)' : ''
            lines.push(`[${t.number}] ${t.description}${status}`)
          }
          lines.push('')
          lines.push('Next: reply in ONE message with the conditions for each item in order, e.g., "1 Good, 2 Good, 3 Fair" or "Good Good Fair".')
          return lines.join('\n')
        }
      }
    } catch (e) {
      debugLog('pre-route guard failed', e)
    }

    const history = await timeIt('history_load', () => loadHistory(phoneNumber))

    // Compose messages: system instructions + session hint + prior history + user
    const messages: any[] = []
    messages.push({ role: 'system', content: INSTRUCTIONS })
    try {
      const meta = await getSessionState(phoneNumber)
      const hintParts: string[] = []
      if (meta.workOrderId) hintParts.push(`workOrderId=${meta.workOrderId}`)
      if (meta.jobStatus) hintParts.push(`jobStatus=${meta.jobStatus}`)
      if (meta.lastMenu) hintParts.push(`lastMenu=${meta.lastMenu}`)
      if (hintParts.length > 0) {
        const policy = 'If jobStatus is confirming and the user replies [1] or "1", call startJob with the confirmed workOrderId immediately and proceed to locations. If they reply [2], present the job edit menu (different job, customer, address, time, status). After any update, show one confirmation; on [1], startJob and do not confirm again.'
        messages.push({ role: 'system', content: `Session: ${hintParts.join(', ')}. ${policy}` })
      }
    } catch {}
    for (const m of history) messages.push({ role: m.role, content: m.content, tool_call_id: (m as any).tool_call_id, name: (m as any).name })
    messages.push({ role: 'user', content: message })

    // Map tools for Chat Completions
    // Choose only the tools relevant to the current session stage to reduce tokens
    let tools = assistantTools as any
    try {
      const meta = await getSessionState(phoneNumber)
      const names = selectToolNames(meta)
      tools = filterToolsByNames(names)
    } catch {}

    // Loop for tool calls
    let rounds = 0
    const maxRounds = Number(process.env.WHATSAPP_TOOL_ROUNDS_MAX ?? 8)
    let lastAssistantMsg: any = null
    while (rounds < maxRounds) {
      let completion: any
      try {
        completion = await timeIt('openai_completion', () => openai.chat.completions.create({ model, messages, tools, tool_choice: 'auto' as any, temperature: Number(process.env.WHATSAPP_TEMPERATURE ?? 0.2) }))
      } catch (e: any) {
        // Fallback if model unsupported for chat
        if (String(e?.code || '').includes('unsupported') || String(e?.message || '').includes('model')) {
          if (model !== 'gpt-4o-mini') {
            debugLog('model unsupported for chat; falling back to gpt-4o-mini')
            completion = await timeIt('openai_completion_fallback', () => openai.chat.completions.create({ model: 'gpt-4o-mini', messages, tools, tool_choice: 'auto' as any, temperature: Number(process.env.WHATSAPP_TEMPERATURE ?? 0.2) }))
          } else {
            throw e
          }
        } else {
          throw e
        }
      }
      const choice = completion.choices?.[0]?.message
      if (!choice) break
      lastAssistantMsg = choice
      if (choice.tool_calls && choice.tool_calls.length > 0) {
        // Push assistant tool call message
        messages.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls })
        for (const tc of choice.tool_calls) {
          const fn = tc.function?.name
          const argsStr = tc.function?.arguments || '{}'
          let args: any
          try { args = JSON.parse(argsStr) } catch { args = {} }
          if (fn === 'getTodayJobs' && !args.inspectorPhone) args.inspectorPhone = phoneNumber
          if (fn === 'collectInspectorInfo' && !args.phone) args.phone = phoneNumber
          const output = await timeIt(`tool:${fn}`, () => executeTool(fn, args, undefined, phoneNumber))
          // Append tool result message per tool call
          messages.push({ role: 'tool', tool_call_id: tc.id, name: fn, content: output })
        }
        rounds++
        continue
      }
      // No tool calls → final
      break
    }

    let finalText = (lastAssistantMsg?.content || '').toString().trim()
    // If we hit the round limit or no text yet, try a final pass forcing text
    if (!finalText) {
      try {
        const finalPass = await timeIt('openai_completion_final', () => openai.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: 'none' as any,
          temperature: Number(process.env.WHATSAPP_TEMPERATURE ?? 0.2)
        }))
        finalText = (finalPass.choices?.[0]?.message?.content || '').toString().trim()
      } catch (e) {
        debugLog('final text pass failed', e)
      }
    }
    // Update history: user + possibly assistant tool call stub + tool outputs + final assistant
    const toAppend: ChatMessage[] = []
    toAppend.push({ role: 'user', content: message })
    // Rebuild from the last call of messages we appended this round only (user + assistant/tool)
    // For simplicity add just the final assistant message
    if (finalText) toAppend.push({ role: 'assistant', content: finalText })
    const next = [...history, ...toAppend]
    await timeIt('history_save', () => saveHistory(phoneNumber, next))
    if (perfOn) {
      const total = perfEvents.reduce((s, e) => s + e.ms, 0)
      console.log('[perf][assistant]', { phone: phoneNumber, totalMs: total, events: perfEvents })
    }
    return finalText || 'I processed your information but couldn\'t generate a response. Please try again.'
  } catch (error) {
    console.error('Error processing with assistant (chat):', error)
    return 'Sorry, I encountered an error processing your request. Please try again.'
  }
}
