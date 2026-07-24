'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { ChevronDownIcon } from './UiIcons'
import { FeaturedAdRotator } from './FeaturedAdRotator'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  onReply?: (message: Message) => void
  onRate?: (messageId: string, rating: 'up' | 'down') => void
  /** True while the live agent handling this ticket is currently typing a
   *  reply. Renders the same dots bubble as the bot's own isLoading state,
   *  just sourced from the ticket-status poll instead. */
  isAgentTyping?: boolean
  /** Name of the agent who's typing, if known — shown as a label above the
   *  dots (e.g. "Jane Wanjiru is typing…") instead of a generic bubble. */
  agentTypingName?: string | null
}

const NEAR_BOTTOM_THRESHOLD = 100
const NUDGE_DISTANCE = 120

export function MessageList({ messages, isLoading, onReply, onRate, isAgentTyping, agentTypingName }: MessageListProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const prevCountRef = React.useRef(0)
  const [showJumpToBottom, setShowJumpToBottom] = React.useState(false)

  const isNearBottom = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }, [])

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
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      setShowJumpToBottom(false)
      return
    }

    if (wasNearBottom) {
      el.scrollBy({ top: NUDGE_DISTANCE, behavior: 'smooth' })
      setShowJumpToBottom(false)
    } else {
      setShowJumpToBottom(true)
    }
  }, [messages, isNearBottom])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el || (!isLoading && !isAgentTyping)) return
    if (isNearBottom()) el.scrollBy({ top: 60, behavior: 'smooth' })
  }, [isLoading, isAgentTyping, isNearBottom])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setShowJumpToBottom(false)
  }

  return (
    <div className="relative flex-1 min-h-0 w-full flex flex-col max-h-[300px] sm:max-h-[360px]">
      {messages.length === 0 ? (
        <div className="flex-1 w-full min-h-0 bg-cic-light animate-fade-in-up flex flex-col overflow-hidden">
          <FeaturedAdRotator edgeToEdge className="w-full flex-1 min-h-0" />
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-cic-light p-2.5 space-y-2.5 min-h-0 text-xs"
        >
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} onReply={onReply} onRate={onRate} />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-cic-white rounded-t-bubble rounded-br-bubble border border-neutral-200 px-3 py-1.5">
                <TypingIndicator />
              </div>
            </div>
          )}
          {!isLoading && isAgentTyping && (
            <div className="flex justify-start">
              <div className="bg-emerald-50 rounded-t-bubble rounded-br-bubble border border-emerald-200 px-3 py-1.5 flex items-center gap-2">
                {agentTypingName && (
                  <span className="text-[11px] font-medium text-emerald-700">{agentTypingName} is typing</span>
                )}
                <TypingIndicator />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {showJumpToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full bg-cic-red text-white text-[11px] font-medium shadow-md hover:bg-cic-red-dark transition-colors animate-fade-in z-30"
        >
          New message
          <ChevronDownIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}