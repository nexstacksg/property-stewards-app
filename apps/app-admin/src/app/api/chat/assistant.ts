import OpenAI from 'openai'
import { assistantTools, executeTool } from './tools'
import { INSTRUCTIONS, INSTRUCTIONS_COMPACT } from '@/app/api/assistant-instructions'
import { cacheGetJSON, cacheSetJSON } from '@/lib/memcache'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
let assistantId: string | null = null
let assistantCreationPromise: Promise<string> | null = null

export async function createAssistant() {
  const model = (process.env.CHAT_ASSISTANT_MODEL || 'gpt-5-nano').trim()
  const useCompact = (process.env.CHAT_USE_COMPACT_INSTRUCTIONS ?? 'true').toLowerCase() !== 'false'
  const instructions = useCompact ? INSTRUCTIONS_COMPACT : INSTRUCTIONS
  const assistant = await openai.beta.assistants.create({
    name: 'Property Inspector Assistant v0.7',
    instructions,
    model,
    tools: assistantTools
  })
  assistantId = assistant.id
  try { await cacheSetJSON('assistant:id', assistant.id) } catch {}
  try {
    await cacheSetJSON('assistant:meta', {
      id: assistant.id,
      model,
      createdAt: new Date().toISOString()
    })
  } catch {}
  return assistantId
}

export async function ensureAssistant(): Promise<string> {
  if (assistantId) return assistantId
  // Try cache (persists across cold starts)
  try {
    const cached = await cacheGetJSON<string>('assistant:id')
    if (cached && typeof cached === 'string') {
      assistantId = cached
      return assistantId
    }
  } catch {}
  if (!assistantCreationPromise) assistantCreationPromise = createAssistant()
  return await assistantCreationPromise
}

export async function runAssistantOnThread(threadId: string, sessionId: string) {
  const asst = await ensureAssistant()
  const run = await openai.beta.threads.runs.create(threadId, { assistant_id: asst })
  console.log('Created run:', run.id, 'for thread:', threadId)

  const poll = async () => openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId })
  let runStatus = await poll()
  console.log('Initial run status:', runStatus.status)

  let attempts = 0
  const pollIntervalMs = Number(process.env.CHAT_RUN_POLL_INTERVAL_MS ?? 1000)
  const maxAttempts = Number(process.env.CHAT_RUN_MAX_ATTEMPTS ?? 30)
  while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, pollIntervalMs))
    runStatus = await poll()
    attempts++
    console.log('Run status:', runStatus.status, 'attempt:', attempts)
  }
  if (attempts >= maxAttempts) throw new Error('Run timed out after 30 seconds')

  // Handle up to 3 rounds of tool calls
  let rounds = 0
  const maxRounds = Number(process.env.CHAT_TOOL_ROUNDS_MAX ?? 2)
  while (runStatus.status === 'requires_action' && rounds < maxRounds) {
    const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || []
    console.log('Processing', toolCalls.length, 'tool calls (round', rounds + 1, ')')
    const outputs: any[] = []
    for (const tc of toolCalls) {
      try {
        const name = tc.function.name
        const args = JSON.parse(tc.function.arguments)
        console.log('Executing tool:', name, 'with args:', args)
        const out = await executeTool(name, args, threadId, sessionId)
        outputs.push({ tool_call_id: tc.id, output: out })
      } catch (err) {
        console.error('Tool execution error:', err)
        outputs.push({ tool_call_id: tc.id, output: JSON.stringify({ success: false, error: 'Tool execution failed' }) })
      }
    }
    await openai.beta.threads.runs.submitToolOutputs(run.id, { thread_id: threadId, tool_outputs: outputs })
    // wait again
    attempts = 0
    runStatus = await poll()
    while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, pollIntervalMs))
      runStatus = await poll()
      attempts++
      console.log('Final run status:', runStatus.status, 'attempt:', attempts)
    }
    rounds++
  }

  console.log('📋 Final run status:', runStatus.status)
  // Fetch only the latest message to reduce payload and latency
  const messages = await openai.beta.threads.messages.list(threadId, { limit: 1, order: 'desc' as any })
  const last = messages.data[0]
  if (last) console.log('📋 Last message role:', last.role, 'type:', last.content[0]?.type)
  if (last && last.role === 'assistant' && last.content[0]?.type === 'text') return last.content[0].text.value
  return 'I apologize, but I encountered an issue processing your request. Please try again.'
}
