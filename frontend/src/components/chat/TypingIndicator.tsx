'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface TypingIndicatorProps {
  className?: string
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className="h-2.5 w-2.5 bg-gray-400 rounded-full animate-pulse-dot"></span>
      <span className="h-2.5 w-2.5 bg-gray-400 rounded-full animate-pulse-dot animation-delay-150"></span>
      <span className="h-2.5 w-2.5 bg-gray-400 rounded-full animate-pulse-dot animation-delay-300"></span>
    </div>
  )
}
