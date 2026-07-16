'use client'

import React from 'react'
import { ChatWindow } from './ChatWindow'
import { cn } from '@/lib/utils'
import { useChat } from '@/hooks/useChat'

export function ChatWidget() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = React.useState(false)
  const [isEndingSession, setIsEndingSession] = React.useState(false)
  // Greeting bubble beside the launcher button (closed state only). Starts
  // hidden and pops in after a beat so it doesn't flash in immediately on
  // page load; dismissible independently of opening the chat.
  const [showGreeting, setShowGreeting] = React.useState(false)
  const widgetRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(true), 1200)
    return () => clearTimeout(timer)
  }, [])

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
            'absolute bottom-20 right-0 w-96 h-[520px] sm:w-96 sm: h-[min(560px,calc(99vh-6rem))]',
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

      {/* Launcher row: greeting bubble + chat button, side by side */}
      <div className="flex items-center justify-end gap-3">
        {!isOpen && showGreeting && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setIsOpen(true)
            }}
            className={cn(
              'relative flex items-center gap-2 pl-4 pr-3 py-3',
              'bg-cic-white rounded-2xl shadow-widget cursor-pointer',
              'border border-neutral-100',
              'slide-in origin-bottom-right'
            )}
          >
            <span className="text-sm font-medium text-cic-gray whitespace-nowrap">
              Ask Bima anything
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowGreeting(false)
              }}
              aria-label="Dismiss"
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-neutral-400 hover:text-cic-gray hover:bg-neutral-100 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* Tail pointing toward the launcher button */}
            <span
              className="absolute -right-1.5 bottom-4 w-3 h-3 bg-cic-white border-r border-b border-neutral-100 rotate-[-45deg]"
              aria-hidden="true"
            />
          </div>
        )}

        {/* Chat Button */}
        <button
          onClick={() => (isOpen ? requestClose() : setIsOpen(true))}
          className={cn(
            'w-14 h-14 rounded-full bg-cic-red text-cic-white',
            'flex items-center justify-center flex-shrink-0',
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
            <img src="/bima-avatar.svg" alt="Chat with Bima" className="w-8 h-8" />
          )}
        </button>
      </div>
    </div>
  )
}