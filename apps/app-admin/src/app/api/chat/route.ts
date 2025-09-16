import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { threadStore } from '@/lib/thread-store'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import { handleMultipartUpload } from './media'
import { ensureAssistant, runAssistantOnThread } from './assistant'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    // Handle multipart upload (local testing for media)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File
      const mediaType = formData.get('mediaType') as string
      const sessionId = (formData.get('sessionId') as string) || 'default'
      const threadId = threadStore.get(sessionId)
      if (!threadId) return NextResponse.json({ error: 'No thread found for session' }, { status: 400 })
      const result = await handleMultipartUpload(file, mediaType, sessionId)
      if ((result as any).error) return NextResponse.json(result, { status: 400 })
      return NextResponse.json(result)
    }

    // Normal chat message handling
    const { message, history, sessionId = 'default', mediaFiles, jobContext } = await request.json()
    console.log('📥 Received request with jobContext:', jobContext)

    // Get or create thread for this session
    let threadId = threadStore.get(sessionId)
    if (!threadId) {
      console.log('Creating new thread for session:', sessionId)
      const thread = await openai.beta.threads.create({
        metadata: {
          sessionId,
          workOrderId: '',
          customerName: '',
          postalCode: '',
          currentLocation: '',
          propertyAddress: '',
          jobStatus: 'none',
          createdAt: new Date().toISOString()
        }
      })
      threadId = thread.id
      threadStore.set(sessionId, threadId)
      console.log('Created thread:', threadId)
      console.log('🆕 Thread created with initial metadata:', thread.metadata)
    } else {
      const currentSession = await getSessionState(sessionId)
      console.log('Using existing thread:', threadId, '📊 Current session state:', currentSession)
    }

    // Update session state with any jobContext passed from UI
    if (jobContext) {
      console.log('📝 Received job context from chat page:', jobContext)
      await updateSessionState(sessionId, jobContext)
    }

    if (!threadId) throw new Error('Failed to create or retrieve thread ID')

    // Add user message to thread
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: message })

    // Ensure assistant and run
    await ensureAssistant()
    const content = await runAssistantOnThread(threadId, sessionId)
    return NextResponse.json({ content, threadId, sessionId })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat message', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

