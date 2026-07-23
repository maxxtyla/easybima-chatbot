'use client'

import React from 'react'
import { QuickQuestion } from '@/types/chat'
import { cn } from '@/lib/utils'

interface QuickQuestionsProps {
  questions: QuickQuestion[]
  onSelect: (question: string) => void
  isLoading?: boolean
}

export function QuickQuestions({ questions, onSelect, isLoading }: QuickQuestionsProps) {
  return (
    <div className="bg-cic-light px-3 pt-2 pb-1.5">
      {/* Bot-style intro bubble, same shape language as a real chat message. Kept small so it sits snugly under the featured ad rotator. */}
      <div className="flex items-end gap-1.5 mb-1.5">
        <img src="/bima-avatar.svg" alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
        <div className="bg-cic-white border border-neutral-200 rounded-t-bubble rounded-br-bubble px-2.5 py-1.5 text-[11px] leading-snug text-cic-gray shadow-sm">
          Welcome to CIC insurance! How can I help you today?
        </div>
      </div>

      {/* Quick replies presented like the user's own picks -- small,
          right-aligned pills that wrap into a compact row. */}
      <div className="flex flex-wrap justify-end gap-1.5 pb-1">
        {questions.map((question) => (
          <button
            key={question.id}
            onClick={() => onSelect(question.text)}
            disabled={isLoading}
            className={cn(
              'max-w-full text-right text-[11px] leading-tight font-medium px-2.5 py-1.5 rounded-full',
              'bg-cic-white border border-neutral-300 text-cic-gray',
              'hover:border-cic-red hover:text-cic-red hover:shadow-sm transition-all',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
          >
            {question.text}
          </button>
        ))}
      </div>
    </div>
  )
}
