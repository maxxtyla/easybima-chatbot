'use client'

import { useState, useCallback, useEffect } from 'react'
import { Message, ChatState } from '@/types/chat'
import { generateId } from '@/lib/utils'
import { sendMessage } from '@/lib/api'

const STORAGE_KEY = 'cic-chat-session'

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    sessionId: '',
    isOpen: false,
  })

  // Initialize session on mount
  useEffect(() => {
    const storedSessionId = localStorage.getItem(STORAGE_KEY)
    const sessionId = storedSessionId || generateId()

    if (!storedSessionId) {
      localStorage.setItem(STORAGE_KEY, sessionId)
    }

    setState((prev) => ({ ...prev, sessionId }))
  }, [])

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const message: Message = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    }

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
    }))

    return message
  }, [])

  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || state.isLoading) return

      // Add user message
      addMessage('user', userMessage)

      setState((prev) => ({ ...prev, isLoading: true }))

      try {
        const response = await sendMessage(state.sessionId, userMessage)
        addMessage('assistant', response.message)
      } catch (error) {
        addMessage('assistant', 'Sorry, I encountered an error. Please try again.')
        console.error('Chat error:', error)
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }))
      }
    },
    [state.sessionId, state.isLoading, addMessage]
  )

  const clearMessages = useCallback(() => {
    setState((prev) => ({ ...prev, messages: [] }))
  }, [])

  const toggleChat = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }))
  }, [])

  return {
    ...state,
    addMessage,
    handleSendMessage,
    clearMessages,
    toggleChat,
  }
}
