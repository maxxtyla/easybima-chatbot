'use client'

import React from 'react'
import { ChatWindow } from './ChatWindow'
import { cn } from '@/lib/utils'
import { useChat } from '@/hooks/useChat'

export function ChatWidget() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = React.useState(false)
  const [isEndingSession, setIsEndingSession] = React.useState(false)
  const widgetRef = React.useRef<HTMLDivElement>(null)

  // Lifted up from ChatWindow so this component can decide whether closing
  // needs confirmation (i.e. is there an active conversation to lose?).
  const chat = useChat()
  const hasOpenTicket = !!chat.ticketNumber && !['resolved', 'closed'].includes(chat.ticketStatus || 'open')
  const hasActiveConversation = chat.messages.length > 0 || hasOpenTicket

  // Clicking the X (or the floating launcher while open) goes through here
  // rather than closing immediately. An empty conversation closes right
  // away; an active one requires explicit confirmation.
  const requestClose = React.useCallback(() => {
    if (hasActiveConversation) {
      setShowCloseConfirm(true)
    } else {
      setIsOpen(false)
    }
  }, [hasActiveConversation])

  const confirmClose = React.useCallback(async () => {
    setIsEndingSession(true)
    try {
      // Tell the backend to close the session and wipe its stored
      // messages, then reset local state for a brand-new conversation.
      await chat.endChatSession()
    } finally {
      setIsEndingSession(false)
      setShowCloseConfirm(false)
      setIsOpen(false)
    }
  }, [chat])

  const cancelClose = React.useCallback(() => {
    setShowCloseConfirm(false)
  }, [])

  // Close chat when clicking outside the widget — but only when there's
  // nothing to lose. If a conversation is underway, an accidental outside
  // click shouldn't silently discard it; the user must use the X button,
  // which triggers the confirmation dialog above.
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        if (hasActiveConversation) return
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, hasActiveConversation])

  return (
    <div
      ref={widgetRef}
      className={cn(
        'fixed z-50',
        'bottom-4 right-4 sm:bottom-6 sm:right-6',
        'transition-all duration-300'
      )}
    >
      {/* Chat Window */}
      {isOpen && (
        <div
          className={cn(
            'absolute bottom-20 right-0 w-96 h-96 sm:w-96 sm:h-[500px]',
            'rounded-lg shadow-widget overflow-hidden',
            'slide-in origin-bottom-right'
          )}
        >
          <ChatWindow
            chat={chat}
            onRequestClose={requestClose}
            showCloseConfirm={showCloseConfirm}
            isEndingSession={isEndingSession}
            onConfirmClose={confirmClose}
            onCancelClose={cancelClose}
          />
        </div>
      )}

      {/* Chat Button */}
      <button
        onClick={() => (isOpen ? requestClose() : setIsOpen(true))}
        className={cn(
          'w-14 h-14 rounded-full bg-cic-red text-cic-white',
          'flex items-center justify-center',
          'shadow-lg hover:shadow-xl hover:bg-cic-red-dark',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cic-red'
        )}
        aria-label="Chat with support"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <img src="/robot.svg" alt="Chat" className="w-6 h-6" />
        )}
      </button>
    </div>
  )
}
