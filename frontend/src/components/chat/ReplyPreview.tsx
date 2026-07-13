'use client'

import React from 'react'
import { ReplySnippet } from '@/types/chat'
import { XIcon } from './UiIcons'
import { truncateText } from '@/lib/utils'

interface ReplyPreviewProps {
  reply: ReplySnippet
  onCancel: () => void
}

function roleLabel(role: ReplySnippet['role']) {
  if (role === 'user') return 'Replying to yourself'
  if (role === 'agent') return 'Replying to Agent'
  if (role === 'system') return 'Replying to System'
  return 'Replying to Bima'
}

export function ReplyPreview({ reply, onCancel }: ReplyPreviewProps) {
  return (
    <div className="flex items-center gap-2 mx-4 mt-3 pl-3 pr-2 py-1.5 rounded-md bg-red-50 border-l-2 border-cic-red animate-fade-in">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-cic-red">{roleLabel(reply.role)}</p>
        <p className="text-xs text-neutral-600 truncate">{truncateText(reply.content, 80)}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-neutral-400 hover:text-cic-red hover:bg-white transition-colors"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
