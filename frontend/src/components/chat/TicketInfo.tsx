'use client'

import React, { useEffect, useState } from 'react'
import { AssignedAgent } from '@/types/chat'

interface TicketInfoProps {
  ticketNumber: string | null | undefined
  assignedAgent: AssignedAgent | null | undefined
  status?: 'open' | 'assigned' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed'
  createdAt?: string
  onClose?: () => void
  isClosing?: boolean
}

export function TicketInfo({
  ticketNumber,
  assignedAgent,
  status = 'open',
  createdAt,
  onClose,
  isClosing,
}: TicketInfoProps) {
  const [timeOpen, setTimeOpen] = useState<string>('')
  const [confirmingClose, setConfirmingClose] = useState(false)

  useEffect(() => {
    if (!createdAt) return

    const updateTimeOpen = () => {
      const created = new Date(createdAt)
      const now = new Date()
      const diffMs = now.getTime() - created.getTime()
      const diffMins = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffDays > 0) setTimeOpen(`${diffDays}d`)
      else if (diffHours > 0) setTimeOpen(`${diffHours}h`)
      else setTimeOpen(`${diffMins}m`)
    }

    updateTimeOpen()
    const interval = setInterval(updateTimeOpen, 60000)
    return () => clearInterval(interval)
  }, [createdAt])

  if (!ticketNumber) return null

  const isTerminal = status === 'resolved' || status === 'closed'

  const statusColors: Record<string, { bg: string; dot: string }> = {
    open: { bg: 'bg-yellow-50 text-yellow-800', dot: 'bg-yellow-400' },
    assigned: { bg: 'bg-blue-50 text-blue-800', dot: 'bg-blue-400' },
    in_progress: { bg: 'bg-blue-50 text-blue-800', dot: 'bg-blue-400' },
    pending_customer: { bg: 'bg-orange-50 text-orange-800', dot: 'bg-orange-400' },
    resolved: { bg: 'bg-green-50 text-green-800', dot: 'bg-green-400' },
    closed: { bg: 'bg-gray-50 text-gray-700', dot: 'bg-gray-400' },
  }

  const colors = statusColors[status] || statusColors.open

  return (
    <div className={`text-xs border border-current border-opacity-10 rounded-md p-2 mx-4 mb-3 shadow-sm bg-white text-gray-600`}>
      {/* Main Single Row Status Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-gray-900">{ticketNumber}</span>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bg}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
            {status.replace(/_/g, ' ')}
          </span>
          {timeOpen && <span className="text-gray-400">· {timeOpen} ago</span>}
        </div>

        {/* Short Inline Actions */}
        <div className="flex items-center gap-3">
          {assignedAgent?.name && (
            <span className="text-gray-500 font-medium max-w-[100px] truncate">
               {assignedAgent.name.split(' ')[0]}
            </span>
          )}

          {!isTerminal && onClose && !confirmingClose && (
            <button
              onClick={() => setConfirmingClose(true)}
              className="text-gray-400 hover:text-gray-900 underline underline-offset-2"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Mini Confirming Box overlay */}
      {confirmingClose && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <span className="text-gray-500 text-[11px]">Close ticket permanently?</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setConfirmingClose(false)}
              disabled={isClosing}
              className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 font-medium"
            >
              No
            </button>
            <button
              onClick={() => {
                onClose()
                setConfirmingClose(false)
              }}
              disabled={isClosing}
              className="px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium"
            >
              {isClosing ? '...' : 'Yes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}