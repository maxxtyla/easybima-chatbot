'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChevronDownIcon } from './UiIcons'
import { ProductAdCarousel } from './ProductAdCarousel'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  onReply?: (message: Message) => void
  onRate?: (messageId: string, rating: 'up' | 'down') => void
}

// How close to the bottom (in px) counts as "already there" — inside this
// band, a new message is revealed automatically; outside it, the person is
// treated as reading back through history and is left alone.
const NEAR_BOTTOM_THRESHOLD = 120
// How far a single incoming bot/agent message nudges the view — a partial
// reveal rather than a full jump-to-bottom, so a burst of short messages
// doesn't feel like the screen is being yanked around.
const NUDGE_DISTANCE = 160

export function MessageList({ messages, isLoading, onReply, onRate }: MessageListProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const prevCountRef = React.useRef(0)
  const [showJumpToBottom, setShowJumpToBottom] = React.useState(false)

  const isNearBottom = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }, [])

  // Track manual scrolling so the "new message" pill clears itself once
  // the person scrolls back down on their own.
  const handleScroll = React.useCallback(() => {
    if (isNearBottom()) setShowJumpToBottom(false)
  }, [isNearBottom])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const prevCount = prevCountRef.current
    const newCount = messages.length
    const added = newCount > prevCount
    const lastMessage = messages[newCount - 1]
    prevCountRef.current = newCount

    if (!added) return

    const wasNearBottom = isNearBottom()

    if (lastMessage?.role === 'user') {
      // The person just sent this themselves — they're already looking at
      // the input, so bring the new message fully into view.
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      setShowJumpToBottom(false)
      return
    }

    // An AI or live-agent message arrived.
    if (wasNearBottom) {
      // Reveal it with a small nudge rather than snapping straight to the
      // very bottom — keeps the motion gentle for quick back-and-forth.
      el.scrollBy({ top: NUDGE_DISTANCE, behavior: 'smooth' })
      setShowJumpToBottom(false)
    } else {
      // The person has scrolled up to read earlier messages — don't yank
      // them away from that, just flag that something new has arrived.
      setShowJumpToBottom(true)
    }
  }, [messages, isNearBottom])

  // The typing indicator appearing/disappearing shouldn't cause a big jump
  // either — only nudge if already close to the bottom.
  React.useEffect(() => {
    const el = containerRef.current
    if (!el || !isLoading) return
    if (isNearBottom()) el.scrollBy({ top: 80, behavior: 'smooth' })
  }, [isLoading, isNearBottom])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setShowJumpToBottom(false)
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto bg-cic-light p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-2 pb-1 animate-fade-in-up">
            <div className="relative mb-3">
              <span className="absolute inset-0 rounded-full bg-cic-red/15 animate-ping-slow" aria-hidden="true" />
              <div className="relative w-16 h-16 rounded-full bg-white p-1.5 shadow-chat-bubble ring-1 ring-neutral-100">
                <img src="/bima-avatar.svg" alt="Bima" className="w-full h-full" />
              </div>
              <span
                className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-white"
                aria-hidden="true"
              />
            </div>
            <h3 className="text-base font-bold text-cic-gray mb-1">Welcome to CIC Insurance</h3>
            <p className="text-sm text-neutral-500 max-w-[260px] mb-5">
              I&apos;m Bima, ready to help with quotes, claims, or any of our products.
            </p>

            <div className="w-full text-left">
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 px-0.5">
                While you&apos;re here, explore
              </h4>
              <ProductAdCarousel compact />
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onReply={onReply} onRate={onRate} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-cic-white rounded-t-bubble rounded-br-bubble border border-neutral-200 px-4 py-3">
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {showJumpToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 pl-3 pr-2.5 py-1.5 rounded-full bg-cic-red text-white text-xs font-medium shadow-lg hover:bg-cic-red-dark transition-colors animate-fade-in"
        >
          New message
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
