import OpenAI from 'openai'
// chat-session not required for responses flow here; session state used elsewhere
import { cacheGetJSON, cacheSetJSON } from '@/lib/memcache'
import { assistantTools, executeTool } from './tools'
import { INSTRUCTIONS } from '@/app/api/assistant-instructions'
import { getSessionState } from '@/lib/chat-session'
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
      // Guard these steps as long as we have a workOrder context; location is not mandatory
      if (meta?.workOrderId) {
        // Condition selection
        if (numMatch && (meta.taskFlowStage === 'condition' || !!meta.currentTaskId)) {
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
            return rr?.message ? `${rr.message}\\n\\n${locs}` : locs
          }
          if (gb && pick === gb) {
            dbg('tasks-select goBack')
            return await executeTool('getJobLocations', { jobId: meta.workOrderId }, undefined, phoneNumber)
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
