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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-4">
      {questions.map((question) => (
        <button
          key={question.id}
          onClick={() => onSelect(question.text)}
          disabled={isLoading}
          className={cn(
            'p-0.5 text-middle text-sm font-medium rounded-lg',
            'bg-cic-white border border-neutral-200',
            'hover:border-cic-red hover:shadow-md transition-all',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'text-cic-gray'
          )}
        >
          {question.text}
        </button>
      ))}
    </div>
  )
}
