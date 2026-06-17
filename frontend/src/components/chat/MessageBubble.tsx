'use client'

import React from 'react'
import { Message } from '@/types/chat'
import { formatTime, cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex chat-message',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-xs lg:max-w-md chat-bubble px-4 py-3',
          isUser
            ? 'bg-cic-red text-cic-white rounded-t-bubble rounded-bl-bubble'
            : 'bg-cic-white text-cic-gray rounded-t-bubble rounded-br-bubble border border-neutral-200'
        )}
      >
        <p className="text-sm leading-relaxed break-words">{message.content}</p>
        <span className={cn('text-xs mt-1 block', isUser ? 'text-red-100' : 'text-neutral-400')}>
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}
