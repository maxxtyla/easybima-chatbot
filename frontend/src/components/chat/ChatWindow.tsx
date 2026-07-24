'use client'

import React from 'react'
import { Header } from './Header'
import { TicketInfo } from './TicketInfo'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { QuickQuestions } from './QuickQuestions'
import { ConfirmEndChatModal } from './ConfirmEndChatModal'
import { ContactInfoModal } from './ContactInfoModal'
import { PolicyDisclaimer } from './PolicyDisclaimer'
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
    sessionId,
    agentTyping,
    notifyTyping,
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

  // Small "by chatting here, you agree…" notice — appears once the
  // customer's first message goes out, dismissible, and stays dismissed
  // for the rest of this session (a fresh session, e.g. after "end chat",
  // will show it again).
  const DISCLAIMER_STORAGE_PREFIX = 'cic-chat-disclaimer-dismissed:'
  const [disclaimerDismissed, setDisclaimerDismissed] = React.useState(false)
  React.useEffect(() => {
    if (!sessionId) return
    setDisclaimerDismissed(localStorage.getItem(`${DISCLAIMER_STORAGE_PREFIX}${sessionId}`) === '1')
  }, [sessionId])
  const dismissDisclaimer = () => {
    setDisclaimerDismissed(true)
    if (sessionId) localStorage.setItem(`${DISCLAIMER_STORAGE_PREFIX}${sessionId}`, '1')
  }
  const hasUserMessage = messages.some((m) => m.role === 'user')
  const showDisclaimer = hasUserMessage && !disclaimerDismissed

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
        ticketStatus={ticketStatus}
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

          <MessageList
            messages={messages}
            isLoading={isLoading}
            onReply={handleReply}
            onRate={rateMessage}
            isAgentTyping={agentTyping}
            agentTypingName={assignedAgent?.name}
          />

          {showQuickQuestions && <QuickQuestions questions={QUICK_QUESTIONS} onSelect={handleSendMessage} isLoading={isLoading} />}

          {showDisclaimer && <PolicyDisclaimer onDismiss={dismissDisclaimer} />}

          <InputBar
            onSend={handleSend}
            isLoading={isLoading}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onTyping={() => notifyTyping(sessionId)}
          />
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
