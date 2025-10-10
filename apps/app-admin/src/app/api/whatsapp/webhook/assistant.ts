import OpenAI from 'openai'
import prisma from '@/lib/prisma'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import { cacheDel, cacheGetJSON, cacheSetJSON, getMemcacheClient } from '@/lib/memcache'
import { assistantTools, executeTool } from './tools'
import { ASSISTANT_VERSION, INSTRUCTIONS } from '@/app/api/assistant-instructions'
import { getInspectorByPhone } from '@/lib/services/inspectorService'

const debugLog = (...args: unknown[]) => {
  const on = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
  if (on === 'true' || on === 'verbose') console.log('[wh-openai]', ...args)
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Thread management for WhatsApp conversations (in-memory hint; persisted via session)
const whatsappThreads = new Map<string, string>()

let assistantId: string | null = null
let assistantVersionLoaded: string | null = null
let assistantCreationPromise: Promise<string> | null = null

export function getCachedThreadId(phone: string) {
  return whatsappThreads.get(phone)
}

export async function postAssistantMessageIfThread(phone: string, content: string) {
  const threadId = whatsappThreads.get(phone)
  if (!threadId) return
  await openai.beta.threads.messages.create(threadId, { role: 'assistant', content })
}

export async function processWithAssistant(phoneNumber: string, message: string): Promise<string> {
  try {
    debugLog('start', { phoneNumber, len: message?.length })
    let threadId: any = whatsappThreads.get(phoneNumber)
    let metadata = await getSessionState(phoneNumber)
    if (!threadId && (metadata as any)?.threadId) {
      threadId = (metadata as any).threadId
      whatsappThreads.set(phoneNumber, threadId)
    }
    if (!threadId) {
      // Try to find inspector by phone to enrich metadata
      let inspector: any = null
      try {
        inspector = await getInspectorByPhone('+' + phoneNumber)
        if (!inspector) inspector = await getInspectorByPhone(phoneNumber)
      } catch {}
      const thread = await openai.beta.threads.create({ metadata: { channel: 'whatsapp', phoneNumber, inspectorId: inspector?.id || '', inspectorName: inspector?.name || '', workOrderId: '', currentLocation: '', createdAt: new Date().toISOString() } })
      threadId = thread.id
      await updateSessionState(phoneNumber, { inspectorId: inspector?.id || '', inspectorName: inspector?.name || '', workOrderId: '', currentLocation: '', createdAt: new Date().toISOString(), threadId: threadId as string })
      whatsappThreads.set(phoneNumber, threadId)
    }

    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message })
    debugLog('message appended', { threadId })

    // Ensure assistant exists
    if (assistantId && assistantVersionLoaded !== ASSISTANT_VERSION) {
      assistantId = null
      assistantCreationPromise = null
    }
    if (!assistantId) {
      let assistantMeta: { version?: string } | null = null
      try { assistantMeta = await cacheGetJSON<{ version?: string }>('assistant:meta') } catch {}
      if (assistantMeta && assistantMeta.version !== ASSISTANT_VERSION) {
        assistantId = null
        assistantCreationPromise = null
        try {
          await cacheDel('assistant:id')
          await cacheDel('assistant:meta')
        } catch {}
      }
      try { assistantId = await cacheGetJSON<string>('assistant:id') } catch {}
      if (!assistantId) {
        if (!assistantCreationPromise) {
          const mc = getMemcacheClient()
          let canCreate = true
          if (mc) {
            try { const locked = await mc.add('assistant:creating', Buffer.from('1'), { expires: 60 }); canCreate = locked } catch {}
          }
          assistantCreationPromise = canCreate ? createAssistant() : (async () => { for (let i = 0; i < 40; i++) { const id = await cacheGetJSON<string>('assistant:id'); if (id) return id; await new Promise(r => setTimeout(r, 500)) } throw new Error('Timeout waiting for assistant id from cache') })()
        }
        try { assistantId = await assistantCreationPromise } catch (e) { assistantCreationPromise = null; return 'Service initialization failed. Please try again.' }
      }
    }
    assistantVersionLoaded = ASSISTANT_VERSION

    // Create run and wait for completion efficiently
    const run = await openai.beta.threads.runs.create(threadId, { assistant_id: assistantId as string })
    debugLog('run created', { runId: run.id })
    let runStatus = await waitForRunCompletion(threadId, run.id)
    let toolCallRounds = 0
    const maxToolCallRounds = 5
    while (runStatus.status === 'requires_action' && toolCallRounds < maxToolCallRounds) {
      debugLog('requires_action', { round: toolCallRounds, tools: runStatus.required_action?.submit_tool_outputs?.tool_calls?.map((t: any)=>t.function?.name) })
      await handleToolCalls(threadId, run.id, runStatus, phoneNumber)
      runStatus = await waitForRunCompletion(threadId, run.id)
      toolCallRounds++
    }
    debugLog('run finished', { status: runStatus.status, rounds: toolCallRounds })
    if (runStatus.status !== 'completed') return 'Sorry, I encountered an issue processing your request. Please try again.'
    const messages = await openai.beta.threads.messages.list(threadId, { limit: 1 })
    const lastMessage = messages.data[0]
    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content[0]
      if (content.type === 'text') return content.text.value
    }
    return 'I processed your information but couldn\'t generate a response. Please try again.'
  } catch (error) {
    console.error('Error processing with assistant:', error)
    return 'Sorry, I encountered an error processing your request. Please try again.'
  }
}

async function waitForRunCompletion(threadId: string, runId: string) {
  let attempts = 0
  const maxAttempts = 600
  let runStatus = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId })
  while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100))
    runStatus = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId })
    attempts++
    if (attempts % 50 === 0) debugLog(`⏳ Still waiting for run completion... (${attempts / 10}s elapsed)`) 
  }
  if (attempts >= maxAttempts) debugLog(`⚠️ Run completion timed out after ${maxAttempts / 10} seconds`)
  return runStatus
}

async function handleToolCalls(threadId: string, runId: string, runStatus: any, phoneNumber: string) {
  const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || []
  const toolOutputs = [] as any[]
  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name
    const functionArgs = JSON.parse(toolCall.function.arguments)
    if (functionName === 'getTodayJobs' && !functionArgs.inspectorPhone) functionArgs.inspectorPhone = phoneNumber
    if (functionName === 'collectInspectorInfo' && !functionArgs.phone) functionArgs.phone = phoneNumber
    const output = await executeTool(functionName, functionArgs, threadId, phoneNumber)
    toolOutputs.push({ tool_call_id: toolCall.id, output })
  }
  await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs: toolOutputs })
}

async function createAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({ name: 'Property Inspector Assistant v0.7', instructions: INSTRUCTIONS, model: 'gpt-4o-mini', tools: assistantTools })
    try {
      await cacheSetJSON('assistant:id', assistant.id, { ttlSeconds: 30 * 24 * 60 * 60 })
      await cacheSetJSON('assistant:meta', { version: ASSISTANT_VERSION }, { ttlSeconds: 30 * 24 * 60 * 60 })
    } catch {}
    return assistant.id
  } catch (error) {
    console.error('❌ ASSISTANT CREATION FAILED:', error)
    throw error
  }
}
