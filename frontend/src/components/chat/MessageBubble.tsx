'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { MessageContent } from './MessageContent'
import { ReplyIcon } from './UiIcons'
import { formatTime, cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
  onReply?: (message: Message) => void
}

export function MessageBubble({ message, onReply }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAgent = message.role === 'agent'
  const isSystem = message.role === 'system'

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

        <span
          className={cn(
            'text-xs mt-1.5 block',
            isUser ? 'text-red-200 text-right' : isSystem ? 'text-blue-600 text-center' : 'text-neutral-400'
          )}
        >
          {formatTime(message.timestamp)}
        </span>
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