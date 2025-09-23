import { NextRequest, NextResponse } from 'next/server'
import { detectHasMedia, sendWhatsAppResponse } from './utils'
import { handleMediaMessage } from './media'
import { processWithAssistant, postAssistantMessageIfThread } from './assistant'
import { getMemcacheClient } from '@/lib/memcache'
import { getSessionState } from '@/lib/chat-session'
import type { ChatSessionState } from '@/lib/chat-session'
import { executeTool } from './tools'

const DEBUG_WHATSAPP = !['', '0', 'false', 'no'].includes((process.env.DEBUG_WHATSAPP || '').toLowerCase())

// Per-instance idempotency to prevent duplicate responses
const processedMessages = new Map<string, { timestamp: number; responseId: string; responded: boolean }>()

// Clean up old processed messages every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [msgId, data] of processedMessages.entries()) {
    if (now - data.timestamp > 300000) processedMessages.delete(msgId)
  }
}, 60000)

// GET - Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret === process.env.WASSENGER_WEBHOOK_SECRET) {
    console.log('✅ Wassenger webhook verified')
    return new Response('OK', { status: 200 })
  }
  return NextResponse.json({ error: 'Invalid secret' }, { status: 403 })
}

// POST - Handle incoming messages
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Verify webhook secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    console.log('🔐 Webhook secret verification:', { provided: secret ? 'present' : 'missing', expected: process.env.WASSENGER_WEBHOOK_SECRET ? 'configured' : 'not configured', matches: secret === process.env.WASSENGER_WEBHOOK_SECRET })
    if (secret !== process.env.WASSENGER_WEBHOOK_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const event = body.event
    const { data } = body
    console.log(`📨 Received webhook event: ${event}`)

    // Allow media-only events even if event type differs
    const preHasMedia = detectHasMedia(data)
    if (event !== 'message:in:new' && !preHasMedia) {
      console.log(`⏭️ Ignoring event: ${event} (no media detected)`) 
      return NextResponse.json({ success: true })
    }

    // Skip outgoing/self messages
    if (data.fromMe || data.self === 1 || data.flow === 'outbound') {
      console.log('⏭️ Skipping outgoing message')
      return NextResponse.json({ success: true })
    }

    const messageId = data.id || `${Date.now()}-${Math.random()}`
    const rawPhone = data.fromNumber || data.from
    const phoneNumber = rawPhone?.replace(/[\s+-]/g, '').replace(/^0+/, '').replace('@c.us', '') || ''
    const message = data.body || data.message?.text?.body || ''

    if (DEBUG_WHATSAPP) {
      console.log('📋 Message summary:', { id: messageId, phone: phoneNumber, type: data.type, messageType: data.messageType, hasBody: !!data.body, bodyLength: message?.length || 0, hasMedia: !!(data.media || data.message?.imageMessage || data.message?.videoMessage), event })
      console.log('🔍 Full WhatsApp message data:', JSON.stringify(data, null, 2))
    }

    const hasMedia = detectHasMedia(data)
    if (DEBUG_WHATSAPP) {
      console.log('🔍 Media detection check:', { hasMedia: data.hasMedia, media: data.media, type: data.type, messageType: data.messageType, imageMessage: data.message?.imageMessage, videoMessage: data.message?.videoMessage, documentMessage: data.message?.documentMessage, detectedMedia: hasMedia })
    }

    const sessionState = await getSessionState(phoneNumber)

    // Cross-instance idempotency via Memcache
    const mc = getMemcacheClient()
    if (mc) {
      try {
        const key = `wh:msg:${messageId}`
        const added = await mc.add(key, Buffer.from('1'), { expires: 300 })
        if (!added) {
          console.log(`⏭️ Skipping duplicate webhook for message ${messageId} (memcache lock present)`) 
          return NextResponse.json({ success: true })
        }
      } catch (e) {
        console.warn('⚠️ Memcache add failed, falling back to in-memory dedupe', e)
      }
    }

    // In-instance idempotency
    const processed = processedMessages.get(messageId)
    if (processed?.responded) return NextResponse.json({ success: true })
    processedMessages.set(messageId, { timestamp: Date.now(), responseId: `resp-${Date.now()}`, responded: false })

    // Fast-path intents (non-media)
    if (!hasMedia && message && message.trim()) {
      const quickHandled = await handleQuickIntent(message, sessionState, phoneNumber)
      if (quickHandled) {
        const msgData = processedMessages.get(messageId)
        if (msgData) { msgData.responded = true; processedMessages.set(messageId, msgData) }
        console.log('⚡ Quick intent handled without assistant')
        return NextResponse.json({ success: true })
      }
    }

    // Media handling
    if (hasMedia) {
      console.log('🔄 Processing media message...')
      await sendWhatsAppResponse(phoneNumber, 'Got it 👍 downloading your media...')
      const mediaResponse = await handleMediaMessage(data, phoneNumber, sessionState)
      if (mediaResponse) {
        await sendWhatsAppResponse(phoneNumber, mediaResponse)
        if (mediaResponse.includes('successfully')) await postAssistantMessageIfThread(phoneNumber, mediaResponse)
        const msgData = processedMessages.get(messageId)
        if (msgData) { msgData.responded = true; processedMessages.set(messageId, msgData) }
        console.log(`✅ Media response sent to ${phoneNumber} in ${Date.now() - startTime}ms`)
        return NextResponse.json({ success: true })
      }
    }

    // Skip empty non-media
    if (!message || !message.trim()) {
      if (!hasMedia) return NextResponse.json({ success: true })
      console.log('📎 Media-only message detected')
    }

    console.log(`📨 Processing message from ${phoneNumber}: "${message}" (ID: ${messageId})`)
    try {
      if (message && message.trim()) await sendWhatsAppResponse(phoneNumber, 'Let me check that for you...')
      const assistantResponse = await processWithAssistant(phoneNumber, message || 'User uploaded media')
      if (assistantResponse && assistantResponse.trim()) {
        await sendWhatsAppResponse(phoneNumber, assistantResponse)
        const msgData = processedMessages.get(messageId)
        if (msgData) { msgData.responded = true; processedMessages.set(messageId, msgData) }
        console.log(`✅ Response sent to ${phoneNumber} in ${Date.now() - startTime}ms`)
      }
    } catch (error) {
      console.error('❌ Error in assistant processing:', error)
      await sendWhatsAppResponse(phoneNumber, 'Sorry, I encountered an error processing your request. Please try again.')
      const msgData = processedMessages.get(messageId)
      if (msgData) { msgData.responded = true; processedMessages.set(messageId, msgData) }
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Webhook error:', error)
    // Return success to prevent webhook retries
    return NextResponse.json({ success: true })
  }
}

type QuickIntentHandler = (message: string, session: ChatSessionState, phoneNumber: string) => Promise<boolean>

type QuickIntentDefinition = {
  test: RegExp | ((msg: string) => boolean)
  handler: QuickIntentHandler
  ack?: string
}

const QUICK_INTENT_HANDLERS: QuickIntentDefinition[] = [
  {
    test: /^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/,
    ack: 'One sec, crafting a reply...',
    handler: async (_message, session, phoneNumber) => {
      const name = session?.inspectorName ? ` ${session.inspectorName.split(' ')[0]}` : ''
      await sendWhatsAppResponse(phoneNumber, `Hi${name}! 👋 I\'m here to help with your inspections. Ask me for your jobs or type [help] if you need ideas.`)
      return true
    }
  },
  {
    test: (msg: string) => /jobs?/.test(msg) && /(show|what|list|today)/.test(msg),
    ack: 'Got it—retrieving today\'s jobs...',
    handler: async (_message, session, phoneNumber) => {
      const payload = await executeTool('getTodayJobs', {
        inspectorId: session?.inspectorId,
        inspectorPhone: session?.inspectorPhone || session?.phoneNumber || phoneNumber
      }, undefined, phoneNumber, session)
      const data = safeJsonParse(payload)
      if (!data?.success) {
        await sendWhatsAppResponse(phoneNumber, 'I couldn\'t find your jobs right now. Please try again in a moment or ask an admin to check your assignment.')
        return true
      }
      if (!data.jobs || data.jobs.length === 0) {
        await sendWhatsAppResponse(phoneNumber, 'It seems there are no inspection jobs available for today.')
        return true
      }
      await sendWhatsAppResponse(phoneNumber, formatJobsList(data.jobs))
      return true
    }
  },
  {
    test: (msg: string) => /start/.test(msg) && /job/.test(msg),
    ack: 'On it—checking your job details...',
    handler: async (_message, session, phoneNumber) => {
      const jobId = session?.workOrderId
      if (!jobId) {
        await sendWhatsAppResponse(phoneNumber, 'Please select a job first before starting. Ask me for your jobs if you need the list again!')
        return true
      }
      const payload = await executeTool('startJob', { jobId }, undefined, phoneNumber, session)
      const data = safeJsonParse(payload)
      if (!data?.success) {
        await sendWhatsAppResponse(phoneNumber, 'I wasn\'t able to start the job. If it\'s already running, try asking for the locations instead.')
        return true
      }
      await sendWhatsAppResponse(phoneNumber, formatStartJob(data))
      return true
    }
  },
  {
    test: (msg: string) => /(show|list).*(location|room)/.test(msg) || /^locations?$/.test(msg),
    ack: 'One moment, getting the locations...',
    handler: async (_message, session, phoneNumber) => {
      const jobId = session?.workOrderId
      if (!jobId) {
        await sendWhatsAppResponse(phoneNumber, 'Once you pick a job I\'ll show you the locations to inspect. Ask me for today\'s jobs to get started!')
        return true
      }
      const payload = await executeTool('getJobLocations', { jobId }, undefined, phoneNumber, session)
      const data = safeJsonParse(payload)
      if (!data?.success || !Array.isArray(data.locationsFormatted)) {
        await sendWhatsAppResponse(phoneNumber, 'I couldn\'t fetch the locations just now. Try again shortly or start the job again to refresh the list.')
        return true
      }
      await sendWhatsAppResponse(phoneNumber, formatLocationsList(data.locationsFormatted))
      return true
    }
  },
  {
    test: (msg: string) => /(upload|send).*(photo|picture|media)/.test(msg),
    ack: 'All right, primed to save your photo...',
    handler: async (_message, session, phoneNumber) => {
      const locationHint = session?.currentLocation ? ` for ${session.currentLocation}` : ''
      await sendWhatsAppResponse(phoneNumber, `Sure! Snap the photo${locationHint ? ` ${locationHint}` : ''} and send it here. You can add a caption to record remarks and I\'ll save both together.`)
      return true
    }
  }
]

async function handleQuickIntent(message: string, session: ChatSessionState, phoneNumber: string): Promise<boolean> {
  const normalized = message.trim().toLowerCase()
  if (!normalized) return false
  for (const intent of QUICK_INTENT_HANDLERS) {
    try {
      const match = intent.test instanceof RegExp ? intent.test.test(normalized) : intent.test(normalized)
      if (match) {
        if (intent.ack) {
          try { await sendWhatsAppResponse(phoneNumber, intent.ack) } catch (error) { console.error('Quick intent ack failed:', error) }
        }
        return await intent.handler(normalized, session, phoneNumber)
      }
    } catch (error) {
      console.error('Quick intent handler failed:', error)
    }
  }
  return false
}

function safeJsonParse(payload: string | null | undefined) {
  if (!payload) return null
  try { return JSON.parse(payload) } catch (error) {
    console.error('Failed to parse tool response:', error)
    return null
  }
}

function formatJobsList(jobs: any[]) {
  const lines = jobs.map((job: any) => {
    const selection = job.selectionNumber || `[${job.jobNumber || '?'}]`
    return `${selection}\n🏠 Property: ${job.property || 'Unknown'}\n⏰ Time: ${job.time || '—'}\n👤 Customer: ${job.customer || 'Unknown'}\n⭐ Priority: ${job.priority || 'Normal'}\nStatus: ${job.status || 'SCHEDULED'}`
  })
  const prompt = `Type ${jobs.map((job: any) => job.selectionNumber || `[${job.jobNumber}]`).join(', ')} to select a job.`
  return `Here are your inspection jobs for today:\n\n${lines.join('\n\n')}\n\n${prompt}`
}

function formatStartJob(data: any) {
  const locations = Array.isArray(data.locationsFormatted) ? data.locationsFormatted.join('\n') : 'No locations found yet.'
  const progress = data.progress ? `Progress: ${data.progress.completed_tasks || 0}/${data.progress.total_tasks || 0} tasks completed.` : ''
  return `The job has been successfully started! Here are the locations available for inspection:\n\n${locations}\n\n${progress ? `${progress}\n\n` : ''}Please select a location to continue the inspection.`
}

function formatLocationsList(locationsFormatted: string[]) {
  return `Here are the locations available for inspection:\n\n${locationsFormatted.join('\n')}\n\nReply with the number (e.g., 1) to select a location.`
}
