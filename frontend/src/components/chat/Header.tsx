'use client'

import React from 'react'
import { AssignedAgent, TicketStatus } from '@/types/chat'

interface HeaderProps {
  onClose?: () => void
  ticketNumber?: string | null
  assignedAgent?: AssignedAgent | null
  ticketStatus?: TicketStatus
}

const TERMINAL_STATUSES: TicketStatus[] = ['resolved', 'closed']

export function Header({ onClose, ticketNumber, assignedAgent, ticketStatus }: HeaderProps) {
  const isTerminal = !!ticketStatus && TERMINAL_STATUSES.includes(ticketStatus)
  // A ticket exists and is still open, but no agent has picked it up yet —
  // "Connecting to agent" rather than "Connected", which previously showed
  // the moment a ticket was created regardless of whether anyone had
  // actually accepted it.
  const isConnecting = !isTerminal && !!ticketNumber && !assignedAgent
  const isConnected = !isTerminal && !!assignedAgent
  // Once the ticket is resolved/closed, drop the agent-status line
  // entirely and fall back to the default "online" dot — there's no
  // active handoff to report on anymore.
  const hasActiveTicket = isConnecting || isConnected

  return (
    <div className="bg-cic-red text-cic-white px-4 py-3 flex items-center justify-between rounded-t-lg shadow-md">
      <div className="flex items-center gap-3 flex-1">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 bg-cic-white rounded-full flex items-center justify-center overflow-hidden">
            <img src="/cic-logo.png" alt="CIC" className="w-8 h-8 object-contain" />
          </div>
          {!hasActiveTicket && (
            <span
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-cic-red"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-base">Bima &mdash; CIC&apos;s AI Support</h2>
          {hasActiveTicket && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-red-100">
                {isConnected ? 'Connected to agent' : 'Connecting to agent…'}
              </p>
              {isConnected && assignedAgent?.name && (
                <div className="flex gap-2 text-xs">
                  <span className="bg-red-700 px-2 py-0.5 rounded">
                    {assignedAgent.name}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-cic-white hover:opacity-80 transition-opacity flex-shrink-0"
          aria-label="Close chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
