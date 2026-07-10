'use client'

import React from 'react'
import { Header } from './Header'
import { TicketInfo } from './TicketInfo'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { QuickQuestions } from './QuickQuestions'
import { ConfirmEndChatModal } from './ConfirmEndChatModal'
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
  // The chat state/actions are owned by the parent (ChatWidget) so it can
  // make close-confirmation decisions (e.g. "is there an active
  // conversation?") without ChatWindow needing to expose internals.
  chat: ReturnType<typeof useChat>
  // Called when the user clicks the header's close (X) button. The parent
  // decides whether that should immediately collapse the widget or first
  // show the "end conversation?" confirmation.
  onRequestClose: () => void
  showCloseConfirm: boolean
  isEndingSession?: boolean
  onConfirmClose: () => void
  onCancelClose: () => void
}

export function ChatWindow({
  chat,
  onRequestClose,
  showCloseConfirm,
  isEndingSession,
  onConfirmClose,
  onCancelClose,
}: ChatWindowProps) {
  const { messages, isLoading, handleSendMessage, ticketNumber, assignedAgent, ticketStatus, ticketCreatedAt, closeTicket, isClosingTicket } = chat
  const showQuickQuestions = messages.length === 0

  return (
    <div className="relative flex flex-col h-full bg-cic-white rounded-lg shadow-widget overflow-hidden">
      <Header 
        onClose={onRequestClose}
        ticketNumber={ticketNumber}
        assignedAgent={assignedAgent}
      />

      {ticketNumber && (
        <TicketInfo 
          ticketNumber={ticketNumber}
          assignedAgent={assignedAgent}
          status={ticketStatus}
          createdAt={ticketCreatedAt}
          onClose={closeTicket}
          isClosing={isClosingTicket}
        />
      )}

      <MessageList messages={messages} isLoading={isLoading} />

      {showQuickQuestions && <QuickQuestions questions={QUICK_QUESTIONS} onSelect={handleSendMessage} isLoading={isLoading} />}

      <InputBar onSend={handleSendMessage} isLoading={isLoading} />

      {showCloseConfirm && (
        <ConfirmEndChatModal
          onConfirm={onConfirmClose}
          onCancel={onCancelClose}
          isEnding={isEndingSession}
          ticketNumber={ticketNumber}
          hasOpenTicket={!!ticketNumber && !['resolved', 'closed'].includes(ticketStatus || 'open')}
        />
      )}
    </div>
  )
}
