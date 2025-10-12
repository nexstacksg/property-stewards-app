import OpenAI from 'openai'
// chat-session not required for responses flow here; session state used elsewhere
import { cacheGetJSON, cacheSetJSON } from '@/lib/memcache'
import { assistantTools, executeTool } from './tools'
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
  const cap = Number(process.env.WHATSAPP_HISTORY_MAX ?? 20)
  const trimmed = messages.slice(-cap)
  try { await cacheSetJSON(HISTORY_KEY(phone), trimmed, { ttlSeconds: HISTORY_TTL }) } catch {}
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
    debugLog('start', { phoneNumber, len: message?.length })
    const model = (process.env.WHATSAPP_ASSISTANT_MODEL || 'gpt-5-nano').trim()

    // Minimal stateful guard: when the user is in a strict step, translate
    // the message directly into the corresponding tool call to keep session
    // in sync and avoid the model skipping steps (e.g., asking for media early).
    try {
      const meta = await getSessionState(phoneNumber)
      const raw = (message || '').trim()
      const numMatch = /^\s*([1-5])\s*$/.exec(raw)
      const lower = raw.toLowerCase()
      const dbg = (...a: any[]) => { if ((process.env.WHATSAPP_DEBUG || '').toLowerCase() !== 'false') console.log('[wh-guard]', ...a) }

      // Job confirmation guard to prevent double confirm
      if (meta?.jobStatus === 'confirming' && meta?.workOrderId) {
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
      if (numMatch && meta?.lastMenu === 'jobs') {
        const pick = Number(numMatch[1])
        dbg('jobs-select', { pick })
        const res = await executeTool('getTodayJobs', { inspectorPhone: phoneNumber }, undefined, phoneNumber)
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
        // Condition selection (only when in condition stage)
        if (numMatch && meta.taskFlowStage === 'condition') {
          const conditionNumber = Number(numMatch[1])
          const out = await executeTool('completeTask', { phase: 'set_condition', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, conditionNumber }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) {
            const nextStage = String(data?.taskFlowStage || '').toLowerCase()
            if (nextStage === 'cause') {
              return 'Please describe the cause for this issue.'
            }
            const condUpper = String(data?.condition || meta.currentTaskCondition || '').toUpperCase()
            if (condUpper === 'NOT_APPLICABLE') {
              return 'Condition saved. You can send photos/videos with a caption for remarks, or type "skip" to continue.'
            }
            return 'Condition saved. Please send photos/videos now — include remarks as a caption. Media is required for this condition.'
          }
        }
        // Cause text
        if (meta.taskFlowStage === 'cause' && raw && !numMatch) {
          const out = await executeTool('completeTask', { phase: 'set_cause', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, cause: raw }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) return data?.message || 'Thanks. Please provide the resolution.'
        }
        // Resolution text
        if (meta.taskFlowStage === 'resolution' && raw && !numMatch) {
          const out = await executeTool('completeTask', { phase: 'set_resolution', workOrderId: meta.workOrderId, taskId: meta.currentTaskId, resolution: raw }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) return data?.message || 'Resolution saved. Please send any photos/videos now (you can add notes as caption), or type "skip" to continue.'
        }
        // Media stage skip
        if (meta.taskFlowStage === 'media' && (lower === 'skip' || lower === 'no')) {
          const cond = String(meta.currentTaskCondition || '').toUpperCase()
          if (cond !== 'NOT_APPLICABLE') {
            return 'Media is required for this condition. Please send at least one photo (you can add remarks as a caption).'
          }
          const out = await executeTool('completeTask', { phase: 'skip_media', workOrderId: meta.workOrderId, taskId: meta.currentTaskId }, undefined, phoneNumber)
          let data: any = null
          try { data = JSON.parse(out) } catch {}
          if (data?.success) return data?.message || 'Okay, skipping media for this Not Applicable condition. Reply [1] if this task is complete, [2] otherwise.'
        }

        // Finalize confirmation step: [1] complete, [2] not yet
        if (numMatch && meta.taskFlowStage === 'confirm') {
          const pick = Number(numMatch[1])
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
        if (numMatch && meta.lastMenu === 'locations') {
          const pick = Number(numMatch[1])
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
        if (numMatch && (meta.lastMenu === 'sublocations' || (meta.workOrderId && meta.currentLocation && !meta.currentSubLocationId))) {
          const pick = Number(numMatch[1])
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

        // Numeric tasks selection mapping (lastMenu = tasks)
        const taskPick = /^\s*(\d{1,2})\s*$/.exec(raw)
        if (meta.lastMenu === 'tasks' && taskPick) {
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
            const locs = await executeTool('getJobLocations', { jobId: meta.workOrderId }, undefined, phoneNumber)
            let locData: any = null; try { locData = JSON.parse(locs) } catch {}
            const formattedLocations: string[] = Array.isArray(locData?.locationsFormatted) ? locData.locationsFormatted : []
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
    } catch (e) {
      debugLog('pre-route guard failed', e)
    }

    const history = await loadHistory(phoneNumber)

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
    const tools = assistantTools as any

    // Loop for tool calls
    let rounds = 0
    const maxRounds = Number(process.env.WHATSAPP_TOOL_ROUNDS_MAX ?? 8)
    let lastAssistantMsg: any = null
    while (rounds < maxRounds) {
      let completion: any
      try {
        completion = await openai.chat.completions.create({ model, messages, tools, tool_choice: 'auto' as any, temperature: Number(process.env.WHATSAPP_TEMPERATURE ?? 0.2) })
      } catch (e: any) {
        // Fallback if model unsupported for chat
        if (String(e?.code || '').includes('unsupported') || String(e?.message || '').includes('model')) {
          if (model !== 'gpt-4o-mini') {
            debugLog('model unsupported for chat; falling back to gpt-4o-mini')
            completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, tools, tool_choice: 'auto' as any, temperature: Number(process.env.WHATSAPP_TEMPERATURE ?? 0.2) })
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
          const output = await executeTool(fn, args, undefined, phoneNumber)
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
        const finalPass = await openai.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: 'none' as any,
          temperature: Number(process.env.WHATSAPP_TEMPERATURE ?? 0.2)
        })
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
    await saveHistory(phoneNumber, next)
    return finalText || 'I processed your information but couldn\'t generate a response. Please try again.'
  } catch (error) {
    console.error('Error processing with assistant (chat):', error)
    return 'Sorry, I encountered an error processing your request. Please try again.'
  }
}
