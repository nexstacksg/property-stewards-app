import OpenAI from 'openai'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import { cacheDel, cacheGetJSON, cacheSetJSON, getMemcacheClient } from '@/lib/memcache'
import { assistantTools, executeTool } from './tools'
import { ASSISTANT_VERSION, INSTRUCTIONS } from '@/app/api/assistant-instructions'
import { getInspectorByPhone } from '@/lib/services/inspectorService'

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
    let threadId: string | undefined = whatsappThreads.get(phoneNumber)
    let metadata = await getSessionState(phoneNumber)
    if (!threadId && metadata?.threadId) {
      threadId = metadata.threadId
      whatsappThreads.set(phoneNumber, threadId)
    }

    if (!threadId) {
      let inspector: any = null
      try {
        inspector = await getInspectorByPhone('+' + phoneNumber) || await getInspectorByPhone(phoneNumber)
      } catch {}
      const thread = await openai.beta.threads.create({
        metadata: {
          channel: 'whatsapp',
          phoneNumber,
          inspectorId: inspector?.id || '',
          inspectorName: inspector?.name || '',
          workOrderId: '',
          currentLocation: '',
          createdAt: new Date().toISOString()
        }
      })
      threadId = thread.id
      await updateSessionState(phoneNumber, {
        inspectorId: inspector?.id || '',
        inspectorName: inspector?.name || '',
        workOrderId: '',
        currentLocation: '',
        createdAt: new Date().toISOString(),
        threadId
      })
      whatsappThreads.set(phoneNumber, threadId)
    }

    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message })

    const ensuredAssistantId = await ensureAssistant()
    const assistantReply = await runAssistantWithStreaming(threadId, ensuredAssistantId, phoneNumber)
    if (assistantReply && assistantReply.trim()) return assistantReply

    const messages = await openai.beta.threads.messages.list(threadId)
    const lastAssistantMessage = messages.data.find(msg => msg.role === 'assistant')
    if (lastAssistantMessage) {
      const textPart = lastAssistantMessage.content.find(part => part.type === 'text') as any
      if (textPart?.text?.value) return textPart.text.value
    }
    return 'I processed your information but couldn\'t generate a response. Please try again.'
  } catch (error) {
    console.error('Error processing with assistant:', error)
    return 'Sorry, I encountered an error processing your request. Please try again.'
  }
}

async function handleToolCalls(threadId: string, runId: string, requiredAction: any, phoneNumber: string) {
  const toolCalls = requiredAction?.submit_tool_outputs?.tool_calls || []
  const toolOutputs = [] as any[]
  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name
    const functionArgs = JSON.parse(toolCall.function.arguments)
    if (functionName === 'getTodayJobs' && !functionArgs.inspectorPhone) functionArgs.inspectorPhone = phoneNumber
    if (functionName === 'collectInspectorInfo' && !functionArgs.phone) functionArgs.phone = phoneNumber
    const output = await executeTool(functionName, functionArgs, threadId, phoneNumber)
    toolOutputs.push({ tool_call_id: toolCall.id, output })
  }
  await openai.beta.threads.runs.submitToolOutputs(runId, {
    thread_id: threadId,
    tool_outputs: toolOutputs
  })
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

async function ensureAssistant(): Promise<string> {
  if (assistantId && assistantVersionLoaded === ASSISTANT_VERSION) return assistantId

  try {
    const meta = await cacheGetJSON<{ version?: string }>('assistant:meta')
    if (meta?.version !== ASSISTANT_VERSION) {
      assistantId = null
      assistantCreationPromise = null
      await cacheDel('assistant:id')
      await cacheDel('assistant:meta')
    }
  } catch {}

  if (!assistantId) {
    try { assistantId = await cacheGetJSON<string>('assistant:id') } catch {}
  }

  if (!assistantId) {
    if (!assistantCreationPromise) {
      const mc = getMemcacheClient()
      let canCreate = true
      if (mc) {
        try {
          const locked = await mc.add('assistant:creating', Buffer.from('1'), { expires: 60 })
          canCreate = locked
        } catch {}
      }
      assistantCreationPromise = canCreate
        ? createAssistant()
        : (async () => {
            for (let i = 0; i < 40; i++) {
              const id = await cacheGetJSON<string>('assistant:id')
              if (id) return id
              await new Promise(resolve => setTimeout(resolve, 500))
            }
            throw new Error('Timeout waiting for assistant id from cache')
          })()
    }

    try {
      assistantId = await assistantCreationPromise
    } catch (error) {
      assistantCreationPromise = null
      console.error('Failed to initialize assistant:', error)
      throw error
    }
  }

  assistantVersionLoaded = ASSISTANT_VERSION
  return assistantId as string
}

type StreamRunResult = {
  text: string
  runId: string | null
  status: 'completed' | 'requires_action' | 'failed' | 'cancelled'
  requiredAction?: any
  error?: string
}

function extractTextFromContent(content: any[] | undefined): string {
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (part?.type === 'text') return part.text?.value ?? ''
      return ''
    })
    .join('')
}

async function streamRunOnce(threadId: string, params: { assistantId?: string; runId?: string }): Promise<StreamRunResult> {
  const stream = params.runId
    ? await openai.beta.threads.runs.stream(threadId, { run_id: params.runId })
    : await openai.beta.threads.runs.stream(threadId, { assistant_id: params.assistantId as string })

  let aggregatedText = ''
  let status: StreamRunResult['status'] = 'completed'
  let runId: string | null = params.runId ?? null
  let requiredAction: any = null
  let error: string | undefined

  for await (const event of stream) {
    switch (event.event) {
      case 'thread.message.delta': {
        const delta = event.data?.delta
        if (!delta) break
        if (!delta.role || delta.role === 'assistant') {
          aggregatedText += extractTextFromContent(delta.content)
        }
        break
      }
      case 'thread.message.completed': {
        const message = event.data?.message
        if (message?.role === 'assistant') {
          aggregatedText += extractTextFromContent(message.content)
        }
        break
      }
      case 'thread.run.requires_action': {
        requiredAction = event.data.required_action
        runId = event.data.id
        status = 'requires_action'
        break
      }
      case 'thread.run.completed': {
        runId = event.data.id
        status = 'completed'
        break
      }
      case 'thread.run.failed': {
        runId = event.data.id
        status = 'failed'
        error = event.data.last_error?.message || 'Assistant run failed'
        break
      }
      case 'thread.run.cancelled': {
        runId = event.data.id
        status = 'cancelled'
        break
      }
      default:
        break
    }
  }

  return {
    text: aggregatedText.trim(),
    runId,
    status,
    requiredAction,
    error,
  }
}

async function runAssistantWithStreaming(threadId: string, ensuredAssistantId: string, phoneNumber: string): Promise<string | null> {
  let runId: string | null = null
  let latestText: string | null = null
  const maxToolCallRounds = 5

  for (let attempt = 0; attempt < maxToolCallRounds; attempt++) {
    const result = await streamRunOnce(threadId, { assistantId: runId ? undefined : ensuredAssistantId, runId })
    if (result.error) {
      console.error('Assistant run stream error:', result.error)
      return null
    }

    if (result.text) latestText = result.text
    runId = result.runId

    if (result.status === 'requires_action' && runId && result.requiredAction) {
      await handleToolCalls(threadId, runId, result.requiredAction, phoneNumber)
      continue
    }

    if (result.status === 'completed') {
      return latestText
    }

    if (result.status === 'cancelled') {
      console.warn('Assistant run cancelled unexpectedly')
      return latestText
    }

    if (result.status === 'failed') {
      console.error('Assistant run failed for thread', threadId)
      return null
    }
  }

  console.warn('Assistant exceeded max tool call rounds')
  return latestText
}

export async function warmAssistant() {
  try {
    await ensureAssistant()
  } catch (error) {
    console.error('Failed to warm assistant at startup:', error)
  }
}

void warmAssistant()
