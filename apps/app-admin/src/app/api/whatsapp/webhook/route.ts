import { NextRequest, NextResponse } from 'next/server'
import { detectHasMedia, sendWhatsAppResponse, buildInstantReply } from './utils'
import { handleMediaMessage } from './media'
import { processWithAssistant, postAssistantMessageIfThread } from './assistant'
import { getMemcacheClient } from '@/lib/memcache'

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
    if (process.env.NODE_ENV !== 'production') console.log('✅ Wassenger webhook verified')
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
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔐 Webhook secret verification:', { provided: secret ? 'present' : 'missing', expected: process.env.WASSENGER_WEBHOOK_SECRET ? 'configured' : 'not configured', matches: secret === process.env.WASSENGER_WEBHOOK_SECRET })
    }
    if (secret !== process.env.WASSENGER_WEBHOOK_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const event = body.event
    const { data } = body
    if (process.env.NODE_ENV !== 'production') console.log(`📨 Received webhook event: ${event}`)

    // Allow media-only events even if event type differs
    const preHasMedia = detectHasMedia(data)
    if (event !== 'message:in:new' && !preHasMedia) {
      if (process.env.NODE_ENV !== 'production') console.log(`⏭️ Ignoring event: ${event} (no media detected)`) 
      return NextResponse.json({ success: true })
    }

    // Skip outgoing/self messages
    if (data.fromMe || data.self === 1 || data.flow === 'outbound') {
      if (process.env.NODE_ENV !== 'production') console.log('⏭️ Skipping outgoing message')
      return NextResponse.json({ success: true })
    }

    const messageId = data.id || `${Date.now()}-${Math.random()}`
    const rawPhone = data.fromNumber || data.from
    const phoneNumber = rawPhone?.replace(/[\s+-]/g, '').replace(/^0+/, '').replace('@c.us', '') || ''
    const message = data.body || data.message?.text?.body || ''

    if (process.env.NODE_ENV !== 'production') {
      console.log('📋 Message summary:', { id: messageId, phone: phoneNumber, type: data.type, messageType: data.messageType, hasBody: !!data.body, bodyLength: message?.length || 0, hasMedia: !!(data.media || data.message?.imageMessage || data.message?.videoMessage), event })
      if (process.env.LOG_WEBHOOK_PAYLOADS === 'true') console.log('🔍 Full WhatsApp message data:', JSON.stringify(data, null, 2))
    }

    const hasMedia = detectHasMedia(data)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 Media detection check:', { hasMedia: data.hasMedia, media: data.media, type: data.type, messageType: data.messageType, imageMessage: data.message?.imageMessage, videoMessage: data.message?.videoMessage, documentMessage: data.message?.documentMessage, detectedMedia: hasMedia })
    }

    // Cross-instance idempotency via Memcache
    const mc = getMemcacheClient()
    if (mc) {
      try {
        const key = `wh:msg:${messageId}`
        const added = await mc.add(key, Buffer.from('1'), { expires: 300 })
        if (!added) {
          if (process.env.NODE_ENV !== 'production') console.log(`⏭️ Skipping duplicate webhook for message ${messageId} (memcache lock present)`) 
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

    // Instant acknowledgement so inspectors get immediate feedback while processing continues
    try {
      const instantReply = buildInstantReply(message || '', hasMedia)
      if (instantReply) {
        void sendWhatsAppResponse(phoneNumber, instantReply)
          .catch(error => { console.error('⚠️ Failed to send instant acknowledgement:', error) })
      }
    } catch (error) {
      console.error('⚠️ Error preparing instant acknowledgement:', error)
    }

    // Media handling
    if (hasMedia) {
      if (process.env.NODE_ENV !== 'production') console.log('🔄 Processing media message...')
      const mediaResponse = await handleMediaMessage(data, phoneNumber)
      if (mediaResponse) {
        await sendWhatsAppResponse(phoneNumber, mediaResponse)
        if (mediaResponse.includes('successfully')) await postAssistantMessageIfThread(phoneNumber, mediaResponse)
        const msgData = processedMessages.get(messageId)
        if (msgData) { msgData.responded = true; processedMessages.set(messageId, msgData) }
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Media response sent to ${phoneNumber} in ${Date.now() - startTime}ms`)
        return NextResponse.json({ success: true })
      }
    }

    // Skip empty non-media
    if (!message || !message.trim()) {
      if (!hasMedia) return NextResponse.json({ success: true })
      if (process.env.NODE_ENV !== 'production') console.log('📎 Media-only message detected')
    }

    if (process.env.NODE_ENV !== 'production') console.log(`📨 Processing message from ${phoneNumber}: "${message}" (ID: ${messageId})`)
    try {
      const assistantResponse = await processWithAssistant(phoneNumber, message || 'User uploaded media')
      if (assistantResponse && assistantResponse.trim()) {
        await sendWhatsAppResponse(phoneNumber, assistantResponse)
        const msgData = processedMessages.get(messageId)
        if (msgData) { msgData.responded = true; processedMessages.set(messageId, msgData) }
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Response sent to ${phoneNumber} in ${Date.now() - startTime}ms`)
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
