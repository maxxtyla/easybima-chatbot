'use client'

import React from 'react'
import { ChatWindow } from './ChatWindow'
import { cn } from '@/lib/utils'

export function ChatWidget() {
  const [isOpen, setIsOpen] = React.useState(false)
  const widgetRef = React.useRef<HTMLDivElement>(null)

  // Close chat when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div
      ref={widgetRef}
      className={cn(
        'fixed z-50',
        'bottom-4 right-4 sm:bottom-6 sm:right-6',
        'transition-all duration-300'
      )}
    >
      {/* Chat Window */}
      {isOpen && (
        <div
          className={cn(
            'absolute bottom-20 right-0 w-96 h-96 sm:w-96 sm:h-[500px]',
            'rounded-lg shadow-widget overflow-hidden',
            'slide-in origin-bottom-right'
          )}
        >
          <ChatWindow onClose={() => setIsOpen(false)} />
        </div>
      )}

      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-14 h-14 rounded-full bg-cic-red text-cic-white',
          'flex items-center justify-center',
          'shadow-lg hover:shadow-xl hover:bg-cic-red-dark',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cic-red'
        )}
        aria-label="Chat with support"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <img src="/robot.svg" alt="Chat" className="w-6 h-6" />
        )}
      </button>
    </div>
  )
}
