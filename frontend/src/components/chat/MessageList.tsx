'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChevronDownIcon } from './UiIcons'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  onReply?: (message: Message) => void
}

// How close to the bottom (in px) counts as "already there" — inside this
// band, a new message is revealed automatically; outside it, the person is
// treated as reading back through history and is left alone.
const NEAR_BOTTOM_THRESHOLD = 120
// How far a single incoming bot/agent message nudges the view — a partial
// reveal rather than a full jump-to-bottom, so a burst of short messages
// doesn't feel like the screen is being yanked around.
const NUDGE_DISTANCE = 160

export function MessageList({ messages, isLoading, onReply }: MessageListProps) {
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
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-neutral-500">
              <h3 className="font-semibold mb-2">Welcome to CIC Insurance</h3>
              <p className="text-sm">I&apos;m Bima CIC AI assistant. I am ready to help you!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onReply={onReply} />
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
