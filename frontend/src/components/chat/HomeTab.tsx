'use client'

import React from 'react'
import { QuickLinks } from './QuickLinks'
import { WhatsAppIcon, ChevronRightIcon, MessageIcon } from './UiIcons'
import { getWhatsAppChatUrl } from '@/lib/config'

interface HomeTabProps {
  onStartChat: () => void
  hasActiveConversation: boolean
}

export function HomeTab({ onStartChat, hasActiveConversation }: HomeTabProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-cic-light p-4 space-y-4">
      <div className="bg-gradient-to-br from-cic-red to-cic-red-dark rounded-lg p-4 text-white shadow-chat-bubble">
        <h2 className="text-lg font-semibold mb-1">Hi there 👋</h2>
        <p className="text-sm text-red-50 leading-relaxed">
          I&apos;m Bima, CIC Insurance&apos;s assistant. Ask me anything, or jump straight to what you need below.
        </p>
      </div>

      <button
        type="button"
        onClick={onStartChat}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white border border-neutral-200 hover:border-cic-red hover:shadow-chat-bubble transition-all text-left"
      >
        <div className="w-9 h-9 rounded-full bg-red-50 text-cic-red flex items-center justify-center flex-shrink-0">
          <MessageIcon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-cic-gray">
            {hasActiveConversation ? 'Continue conversation' : 'Start a conversation'}
          </p>
          <p className="text-xs text-neutral-500">Chat with Bima or a live agent</p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-neutral-300 flex-shrink-0" />
      </button>

      <QuickLinks />

      <a
        href={getWhatsAppChatUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/15 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center flex-shrink-0">
            <WhatsAppIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-cic-gray">Reach us on WhatsApp</p>
            <p className="text-xs text-neutral-500">Chat with customer care</p>
          </div>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
      </a>
    </div>
  )
}
