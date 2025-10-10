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

    // Light enrichment on first contact: cache inspector metadata in history context
    const history = await loadHistory(phoneNumber)
    if (history.length === 0) {
      try {
        const inspector = (await getInspectorByPhone('+' + phoneNumber)) || (await getInspectorByPhone(phoneNumber))
        if (inspector) {
          history.push({ role: 'system', content: `Inspector context: id=${inspector.id}, name=${inspector.name}, phone=${inspector.mobilePhone || ''}` })
        }
      } catch {}
    }

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
    const maxRounds = Number(process.env.WHATSAPP_TOOL_ROUNDS_MAX ?? 3)
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

    const finalText = (lastAssistantMsg?.content || '').toString().trim()
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
