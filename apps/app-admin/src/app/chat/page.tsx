'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  mediaType?: 'photo' | 'video'
  mediaUrl?: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hi! I\'m your Property Stewards Assistant. I can help you with your inspection tasks today. Try saying "show me my jobs today" to get started.',
      role: 'assistant',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(`inspector-chat-${Date.now()}`)
  const [showMediaButtons, setShowMediaButtons] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [pendingMedia, setPendingMedia] = useState<{ type: 'photo' | 'video', url: string, name: string }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Check if we're in task inspection stage based on messages
  useEffect(() => {
    // Look for task context in recent messages
    const recentMessages = messages.slice(-5).reverse()
    
    let inTaskMode = false
    for (const msg of recentMessages) {
      if (msg.role === 'assistant') {
        const content = msg.content.toLowerCase()
        
        // We're in task mode if assistant mentions:
        if (
          content.includes('you can upload photo') ||
          content.includes('upload photo') ||
          content.includes('add any notes') ||
          content.includes('mark complete') ||
          content.includes('type \'done\'') ||
          (content.includes('task') && content.includes('complete')) ||
          content.includes('media has been uploaded')
        ) {
          inTaskMode = true
          break
        }
        
        // We've left task mode if:
        if (
          content.includes('all tasks completed') ||
          content.includes('job completed') ||
          content.includes('select a location') ||
          content.includes('choose a room')
        ) {
          inTaskMode = false
          break
        }
      }
    }
    
    setShowMediaButtons(inTaskMode)
  }, [messages])

  const handleSendMessage = async () => {
    if ((!input.trim() && pendingMedia.length === 0) || isLoading) return

    // Prepare message content
    let messageContent = input
    if (pendingMedia.length > 0) {
      const photoCount = pendingMedia.filter(m => m.type === 'photo').length
      const videoCount = pendingMedia.filter(m => m.type === 'video').length
      
      if (messageContent) messageContent += '\n\n'
      messageContent += `[Attached: ${photoCount > 0 ? `${photoCount} photo${photoCount > 1 ? 's' : ''}` : ''}${photoCount > 0 && videoCount > 0 ? ' and ' : ''}${videoCount > 0 ? `${videoCount} video${videoCount > 1 ? 's' : ''}` : ''}]`
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      role: 'user',
      timestamp: new Date(),
      // Show first media as preview in message
      mediaType: pendingMedia[0]?.type,
      mediaUrl: pendingMedia[0]?.url
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    
    // Store media for sending
    const mediaToSend = [...pendingMedia]
    setPendingMedia([])
    
    setIsLoading(true)

    try {
      // If there are media files, mention them in the message
      let apiMessage = input
      if (mediaToSend.length > 0) {
        for (const media of mediaToSend) {
          apiMessage += `\n[User uploaded a ${media.type}: ${media.name}]`
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: apiMessage || 'User uploaded media files',
          sessionId: sessionId,
          // Send media metadata only, not the actual files
          mediaFiles: mediaToSend.map(m => ({ 
            type: m.type, 
            name: m.name 
          })),
          history: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.content || data.message || 'No response received',
        role: 'assistant',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Clean up object URLs
      mediaToSend.forEach(m => URL.revokeObjectURL(m.url))
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error. Please try again.',
        role: 'assistant',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFilesUpload = async (files: FileList) => {
    if (!files || files.length === 0) return

    const newMedia: { type: 'photo' | 'video', url: string, name: string }[] = []

    // Process all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isVideo = file.type.startsWith('video/')
      const mediaType: 'photo' | 'video' = isVideo ? 'video' : 'photo'
      
      // Create object URL for preview (much smaller than base64)
      const url = URL.createObjectURL(file)
      
      newMedia.push({ 
        type: mediaType, 
        url: url,
        name: file.name 
      })
    }
    
    // Add to pending media (will be sent with next message)
    setPendingMedia(prev => [...prev, ...newMedia])
  }

  const handleMediaClick = () => {
    mediaInputRef.current?.click()
  }

  const removePendingMedia = (index: number) => {
    setPendingMedia(prev => {
      const newMedia = [...prev]
      URL.revokeObjectURL(newMedia[index].url)
      newMedia.splice(index, 1)
      return newMedia
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Inspector Assistant</h1>
            <p className="text-sm opacity-90">Property Stewards</p>
          </div>
        </div>
      </div>

      {/* Messages Area with CSS scroll */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] lg:max-w-[70%] ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-l-2xl rounded-tr-2xl'
                    : 'bg-white border border-gray-200 rounded-r-2xl rounded-tl-2xl shadow-sm'
                }`}
              >
                <div className="p-3">
                  {/* Show media if present */}
                  {message.mediaUrl && message.mediaType === 'photo' && (
                    <img 
                      src={message.mediaUrl} 
                      alt="Uploaded photo" 
                      className="max-w-full rounded mb-2"
                      style={{ maxHeight: '200px' }}
                    />
                  )}
                  {message.mediaUrl && message.mediaType === 'video' && (
                    <video 
                      src={message.mediaUrl} 
                      controls 
                      className="max-w-full rounded mb-2"
                      style={{ maxHeight: '200px' }}
                    />
                  )}
                  {/* Message content with proper formatting for job details */}
                  <div className={`text-sm whitespace-pre-wrap ${
                    message.role === 'user' ? 'text-white' : 'text-gray-800'
                  }`}>
                    {message.content}
                  </div>
                  <div className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                  }`}>
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-r-2xl rounded-tl-2xl shadow-sm p-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="border-t bg-white p-4 flex-shrink-0">
        {/* Show pending media preview */}
        {pendingMedia.length > 0 && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg">
            <div className="flex flex-wrap gap-2">
              {pendingMedia.map((media, index) => (
                <div key={index} className="relative group">
                  {media.type === 'photo' ? (
                    <img 
                      src={media.url} 
                      alt={media.name}
                      className="w-16 h-16 object-cover rounded border"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded border flex items-center justify-center">
                      <span className="text-xs">📹</span>
                    </div>
                  )}
                  <button
                    onClick={() => removePendingMedia(index)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {pendingMedia.length} file{pendingMedia.length > 1 ? 's' : ''} ready to send with your message
            </p>
          </div>
        )}
        
        <div className="flex gap-2">
          {/* Single media upload button - only show during task inspection */}
          {showMediaButtons && (
            <Button
              onClick={handleMediaClick}
              disabled={isLoading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700"
              title="Upload Photos/Videos"
            >
              <ImagePlus className="w-4 h-4" />
            </Button>
          )}
          
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              showMediaButtons 
                ? "Add notes or type 'done' to mark complete..." 
                : pendingMedia.length > 0 
                  ? "Add notes about this task..." 
                  : "Ask about your jobs, schedules, or inspections..."
            }
            disabled={isLoading}
            className="flex-1 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button 
            onClick={handleSendMessage}
            disabled={(!input.trim() && pendingMedia.length === 0) || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Single hidden file input that accepts both photos and videos, multiple files */}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            if (files) handleFilesUpload(files)
            e.target.value = '' // Reset input
          }}
        />
        
        <p className="text-xs text-gray-500 mt-2">
          {showMediaButtons 
            ? "Upload media and add comments before sending"
            : "Try: \"What are my jobs today?\" or \"Show me pending inspections\""
          }
        </p>
      </div>
    </div>
  )
}