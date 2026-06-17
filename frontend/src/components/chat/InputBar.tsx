'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface InputBarProps {
  onSend: (message: string) => void
  isLoading?: boolean
  placeholder?: string
}

export function InputBar({ onSend, isLoading, placeholder }: InputBarProps) {
  const [input, setInput] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      onSend(input)
      setInput('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-cic-white border-t border-neutral-200 p-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder || 'Type your message...'}
          disabled={isLoading}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-lg border border-neutral-300',
            'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cic-red',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'text-cic-gray text-sm'
          )}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={cn(
            'px-4 py-2.5 rounded-lg font-medium text-cic-white text-sm',
            'bg-cic-red hover:bg-cic-red-dark transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center'
          )}
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1" fill="currentColor" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}
