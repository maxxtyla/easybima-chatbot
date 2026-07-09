'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { MessageContent } from './MessageContent'
import { formatTime, cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAgent = message.role === 'agent'

  return (
    
    <div
      className={cn(
        'flex chat-message',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Avatar — Bima for the bot, a distinct badge for a human agent */}
      {!isUser && (
        <div
          className={cn(
            'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-1 self-start',
            isAgent ? 'bg-emerald-600' : 'bg-cic-red'
          )}
        >
          <span className="text-white text-xs font-bold">{isAgent ? 'A' : 'B'}</span>
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] px-4 py-3 shadow-chat-bubble',
          isUser
            ? 'bg-cic-red text-white rounded-t-bubble rounded-bl-bubble'
            : isAgent
            ? 'bg-emerald-50 text-gray-800 rounded-t-bubble rounded-br-bubble border border-emerald-200'
            : 'bg-white text-gray-800 rounded-t-bubble rounded-br-bubble border border-neutral-200'
        )}
      >
        {isAgent && (
          <span className="block text-[10px] uppercase tracking-wide font-semibold text-emerald-700 mb-1">
            Live agent
          </span>
        )}

        {/* 
          FIX: was rendering `message.content` as raw text — bypassing 
          all markdown. Now delegates to MessageContent which runs the 
          cleaner + react-markdown pipeline. 
        */}
        <MessageContent content={message.content} isUser={isUser} />

        <span
          className={cn(
            'text-xs mt-1.5 block',
            isUser ? 'text-red-200 text-right' : 'text-neutral-400'
          )}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>



  )
}
