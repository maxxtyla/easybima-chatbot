'use client'

import React from 'react'
import { Header } from './Header'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { QuickQuestions } from './QuickQuestions'
import { useChat } from '@/hooks/useChat'
import { QuickQuestion } from '@/types/chat'

const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    id: '1',
    text: 'How do I get an insurance quote?',
  },
  {
    id: '2',
    text: 'What insurance products do you offer?',
  },
  {
    id: '3',
    text: 'How do I file a claim?',
  },
  {
    id: '4',
    text: 'What saving solutions do you offer?',
  },
  {
    id: '5',
    text: 'Do you offer health insurance?',
  },
 
  {
    id: '6',
    text: 'Tell me about  CIC insurance Group.',
  },
]

interface ChatWindowProps {
  onClose?: () => void
}

export function ChatWindow({ onClose }: ChatWindowProps) {
  const { messages, isLoading, handleSendMessage } = useChat()
  const showQuickQuestions = messages.length === 0

  return (
    <div className="flex flex-col h-full bg-cic-white rounded-lg shadow-widget overflow-hidden">
      <Header onClose={onClose} />

      <MessageList messages={messages} isLoading={isLoading} />

      {showQuickQuestions && <QuickQuestions questions={QUICK_QUESTIONS} onSelect={handleSendMessage} isLoading={isLoading} />}

      <InputBar onSend={handleSendMessage} isLoading={isLoading} />
    </div>
  )
}
