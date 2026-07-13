'use client'

import React from 'react'

interface ConfirmEndChatModalProps {
  onConfirm: () => void
  onCancel: () => void
  isEnding?: boolean
  // When the customer still has an open (non-terminal) support ticket,
  // show an extra warning so they understand ending the chat won't cancel
  // the ticket an agent is still coming to help with.
  ticketNumber?: string | null
  hasOpenTicket?: boolean
}

export function ConfirmEndChatModal({ onConfirm, onCancel, isEnding, ticketNumber, hasOpenTicket }: ConfirmEndChatModalProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-chat-title"
      aria-describedby="end-chat-description"
    >
      <div className="w-[85%] max-w-xs bg-cic-white rounded-xl shadow-xl p-5 animate-slide-up">
        <h3 id="end-chat-title" className="text-base font-semibold text-cic-gray mb-1">
          End this conversation?
        </h3>
        <p id="end-chat-description" className="text-sm text-neutral-600 mb-3">
          Closing the chat will end this session and clear the conversation. You can always start a new one anytime.
        </p>
        {hasOpenTicket && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            ⚠️ You still have an open support ticket{ticketNumber ? ` (${ticketNumber})` : ''}. Do you want to cancel it entirely?
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isEnding}
            className="px-3.5 py-2 text-sm font-medium rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            Keep chatting
          </button>
          <button
            onClick={onConfirm}
            disabled={isEnding}
            className="px-3.5 py-2 text-sm font-medium rounded-lg text-cic-white bg-cic-red hover:bg-cic-red-dark transition-colors disabled:opacity-70"
          >
            {isEnding ? 'Ending…' : 'End conversation'}
          </button>
        </div>
      </div>
    </div>
  )
}
