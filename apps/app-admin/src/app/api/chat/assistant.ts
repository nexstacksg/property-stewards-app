import OpenAI from 'openai'
import { assistantTools, executeTool } from './tools'
import { INSTRUCTIONS } from '@/app/api/assistant-instructions'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
let assistantId: string | null = null

export async function createAssistant() {
  const assistant = await openai.beta.assistants.create({ name: 'Property Inspector Assistant v0.7', instructions: INSTRUCTIONS, model: 'gpt-4o-mini', tools: assistantTools })
  assistantId = assistant.id
  return assistantId
}

export async function ensureAssistant(): Promise<string> {
  if (assistantId) return assistantId
  return await createAssistant()
}

export async function runAssistantOnThread(threadId: string, sessionId: string) {
  const asst = await ensureAssistant()
  const run = await openai.beta.threads.runs.create(threadId, { assistant_id: asst })
  console.log('Created run:', run.id, 'for thread:', threadId)

  const poll = async () => openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId })
  let runStatus = await poll()
  console.log('Initial run status:', runStatus.status)

  let attempts = 0
  const maxAttempts = 30
  while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 1000))
    runStatus = await poll()
    attempts++
    console.log('Run status:', runStatus.status, 'attempt:', attempts)
  }
  if (attempts >= maxAttempts) throw new Error('Run timed out after 30 seconds')

  // Handle up to 3 rounds of tool calls
  let rounds = 0
  while (runStatus.status === 'requires_action' && rounds < 3) {
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
      await new Promise(r => setTimeout(r, 1000))
      runStatus = await poll()
      attempts++
      console.log('Final run status:', runStatus.status, 'attempt:', attempts)
    }
    rounds++
  }

  console.log('📋 Final run status:', runStatus.status)
  const messages = await openai.beta.threads.messages.list(threadId)
  console.log('📋 Messages data length:', messages.data.length)
  console.log('📋 All message roles:', messages.data.map(m => m.role))
  const last = messages.data[0]
  if (last) console.log('📋 Last message role:', last.role, 'type:', last.content[0]?.type)
  if (last && last.role === 'assistant' && last.content[0]?.type === 'text') return last.content[0].text.value
  return 'I apologize, but I encountered an issue processing your request. Please try again.'
}
