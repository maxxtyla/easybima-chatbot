'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { MessageContent } from './MessageContent'
import { ReplyIcon, ThumbsUpIcon, ThumbsDownIcon } from './UiIcons'
import { formatTime, cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
  onReply?: (message: Message) => void
  /** Persists a 👍/👎 on this reply. Tapping the active rating again
   *  clears it — see useChat's rateMessage. Only rendered for bot
   *  ('assistant') replies. */
  onRate?: (messageId: string, rating: 'up' | 'down') => void
}

export function MessageBubble({ message, onReply, onRate }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAgent = message.role === 'agent'
  const isSystem = message.role === 'system'
  // Feedback is scoped to bot replies — rating a live agent's message or
  // the customer's own message doesn't fit the "catch silent bot
  // failures" purpose of this feature.
  const isBotReply = message.role === 'assistant'

  return (
    <div
      className={cn(
        'group flex items-end gap-1 chat-message',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Reply affordance on the left of user bubbles so it sits between
          the bubble and the edge, mirroring where it appears on the right
          for bot/agent bubbles. Only shown on hover/focus, and hidden for
          system messages since replying to those doesn't make sense. */}
      {!isSystem && isUser && onReply && (
        <button
          type="button"
          onClick={() => onReply(message)}
          aria-label="Reply to this message"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 mb-1 w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500 hover:text-cic-red hover:border-cic-red flex items-center justify-center shadow-sm"
        >
          <ReplyIcon className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Avatar — Bima for the bot, a distinct badge for a human agent */}
      {!isUser && !isSystem && (
        isAgent ? (
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mr-1 mb-1 self-end bg-emerald-600">
            <span className="text-white text-xs font-bold">
              {message.agentName?.trim()?.[0]?.toUpperCase() || 'A'}
            </span>
          </div>
        ) : (
          <img
            src="/bima-avatar.svg"
            alt="Bima"
            className="flex-shrink-0 w-7 h-7 rounded-full mr-1 mb-1 self-end"
          />
        )
      )}

      <div
        className={cn(
          'max-w-[80%] px-4 py-3 shadow-chat-bubble',
          isSystem
            ? 'bg-blue-50 text-blue-900 rounded-lg border border-blue-200 italic text-xs mx-auto'
            : isUser
            ? 'bg-cic-red text-white rounded-t-bubble rounded-bl-bubble'
            : isAgent
            ? 'bg-emerald-50 text-gray-800 rounded-t-bubble rounded-br-bubble border border-emerald-200'
            : 'bg-white text-gray-800 rounded-t-bubble rounded-br-bubble border border-neutral-200'
        )}
      >
        {isAgent && (
          <span className="block text-[10px] uppercase tracking-wide font-semibold text-emerald-700 mb-1">
            {message.agentName || 'Live agent'}
          </span>
        )}

        {message.replyTo && (
          <div
            className={cn(
              'mb-2 pl-2 border-l-2 rounded-r text-xs py-1 pr-2',
              isUser ? 'border-red-200 bg-white/10 text-red-50' : 'border-cic-red bg-black/5 text-neutral-500'
            )}
          >
            <p className={cn('font-semibold', isUser ? 'text-red-100' : 'text-neutral-600')}>
              {roleLabel(message.replyTo.role)}
            </p>
            <p className="truncate">{message.replyTo.content}</p>
          </div>
        )}

        {/* 
          FIX: was rendering `message.content` as raw text — bypassing 
          all markdown. Now delegates to MessageContent which runs the 
          cleaner + react-markdown pipeline. 
        */}
        <MessageContent content={message.content} isUser={isUser} isSystem={isSystem} />

        <div className={cn('flex items-center mt-1.5', isBotReply ? 'justify-between' : '')}>
          <span
            className={cn(
              'text-xs block',
              isUser ? 'text-red-200 text-right w-full' : isSystem ? 'text-blue-600 text-center w-full' : 'text-neutral-400'
            )}
          >
            {formatTime(message.timestamp)}
          </span>

          {isBotReply && onRate && (
            <div
              className={cn(
                'flex items-center gap-0.5 -mr-1 transition-opacity',
                // Once rated, keep the icon visible as confirmation instead
                // of fading it back out on mouse-leave.
                message.feedback ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
              )}
            >
              <button
                type="button"
                onClick={() => onRate(message.id, 'up')}
                aria-label={message.feedback === 'up' ? 'Remove helpful rating' : 'Mark this reply as helpful'}
                aria-pressed={message.feedback === 'up'}
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                  message.feedback === 'up'
                    ? 'text-emerald-600'
                    : 'text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50'
                )}
              >
                <ThumbsUpIcon className="w-3.5 h-3.5" filled={message.feedback === 'up'} />
              </button>
              <button
                type="button"
                onClick={() => onRate(message.id, 'down')}
                aria-label={message.feedback === 'down' ? 'Remove not helpful rating' : 'Mark this reply as not helpful'}
                aria-pressed={message.feedback === 'down'}
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                  message.feedback === 'down'
                    ? 'text-cic-red'
                    : 'text-neutral-400 hover:text-cic-red hover:bg-red-50'
                )}
              >
                <ThumbsDownIcon className="w-3.5 h-3.5" filled={message.feedback === 'down'} />
              </button>
            </div>
          )}
        </div>
      </div>

      {!isSystem && !isUser && onReply && (
        <button
          type="button"
          onClick={() => onReply(message)}
          aria-label="Reply to this message"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 mb-1 w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500 hover:text-cic-red hover:border-cic-red flex items-center justify-center shadow-sm"
        >
          <ReplyIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function roleLabel(role: Message['role']) {
  if (role === 'user') return 'You'
  if (role === 'agent') return 'Agent'
  if (role === 'system') return 'System'
  return 'Bima'
}