'use client'

import React from 'react'
import { Header } from './Header'
import { TicketInfo } from './TicketInfo'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { QuickQuestions } from './QuickQuestions'
import { ConfirmEndChatModal } from './ConfirmEndChatModal'
import { ContactInfoModal } from './ContactInfoModal'
import { HomeTab } from './HomeTab'
import { TabBar, WidgetTab } from './TabBar'
import { useChat } from '@/hooks/useChat'
import { Message, QuickQuestion, ReplySnippet } from '@/types/chat'

const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    id: '1',
    text: 'Speak to customer care agent',
  },
  {
    id: '2',
    text: 'Haba na Haba CIC',
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
  const {
    messages,
    isLoading,
    handleSendMessage,
    ticketNumber,
    assignedAgent,
    ticketStatus,
    ticketCreatedAt,
    closeTicket,
    isClosingTicket,
    awaitingContactInfo,
    submitContactInfo,
    skipContactInfo,
    isSubmittingContact,
    contactError,
    rateMessage,
  } = chat
  const showQuickQuestions = messages.length === 0

  const hasActiveConversation = messages.length > 0 || !!ticketNumber
  const [activeTab, setActiveTab] = React.useState<WidgetTab>(hasActiveConversation ? 'chat' : 'home')
  const [replyTo, setReplyTo] = React.useState<ReplySnippet | null>(null)

  // Flag the Conversation tab with a dot when a bot/agent message lands
  // while the person is browsing the Home tab, so they know something's
  // waiting without being yanked over automatically.
  const seenCountRef = React.useRef(messages.length)
  const [showChatBadge, setShowChatBadge] = React.useState(false)
  React.useEffect(() => {
    if (activeTab === 'chat') {
      seenCountRef.current = messages.length
      setShowChatBadge(false)
      return
    }
    if (messages.length > seenCountRef.current) {
      const last = messages[messages.length - 1]
      if (last && last.role !== 'user') setShowChatBadge(true)
    }
  }, [messages, activeTab])

  const handleReply = (message: Message) => {
    setReplyTo({ id: message.id, role: message.role, content: message.content })
  }

  const handleSend = (text: string, reply?: ReplySnippet) => {
    handleSendMessage(text, reply)
    setReplyTo(null)
  }

  return (
    <div className="relative flex flex-col h-full bg-cic-white rounded-lg shadow-widget overflow-hidden">
      <Header 
        onClose={onRequestClose}
        ticketNumber={ticketNumber}
        assignedAgent={assignedAgent}
      />

      {activeTab === 'home' ? (
        <HomeTab hasActiveConversation={hasActiveConversation} onStartChat={() => setActiveTab('chat')} />
      ) : (
        <>
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

          <MessageList messages={messages} isLoading={isLoading} onReply={handleReply} onRate={rateMessage} />

          {showQuickQuestions && <QuickQuestions questions={QUICK_QUESTIONS} onSelect={handleSendMessage} isLoading={isLoading} />}

          <InputBar onSend={handleSend} isLoading={isLoading} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
        </>
      )}

      <TabBar active={activeTab} onChange={setActiveTab} showChatBadge={showChatBadge} />

      {showCloseConfirm && (
        <ConfirmEndChatModal
          onConfirm={onConfirmClose}
          onCancel={onCancelClose}
          isEnding={isEndingSession}
          ticketNumber={ticketNumber}
          hasOpenTicket={!!ticketNumber && !['resolved', 'closed'].includes(ticketStatus || 'open')}
        />
      )}

      {!showCloseConfirm && awaitingContactInfo && (
        <ContactInfoModal
          ticketNumber={ticketNumber}
          onSubmit={submitContactInfo}
          onSkip={skipContactInfo}
          isSubmitting={isSubmittingContact}
          errorMessage={contactError}
        />
      )}
    </div>
  )
}
