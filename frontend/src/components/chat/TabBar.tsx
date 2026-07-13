'use client'

import React from 'react'
import { HomeIcon, MessageIcon } from './UiIcons'
import { cn } from '@/lib/utils'

export type WidgetTab = 'home' | 'chat'

interface TabBarProps {
  active: WidgetTab
  onChange: (tab: WidgetTab) => void
  showChatBadge?: boolean
}

export function TabBar({ active, onChange, showChatBadge }: TabBarProps) {
  const tabs: { id: WidgetTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <HomeIcon className="w-5 h-5" /> },
    { id: 'chat', label: 'Conversation', icon: <MessageIcon className="w-5 h-5" /> },
  ]

  return (
    <div className="flex border-t border-neutral-200 bg-cic-white flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
          className={cn(
            'relative flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
            active === tab.id ? 'text-cic-red' : 'text-neutral-400 hover:text-neutral-600'
          )}
        >
          <span className="relative">
            {tab.icon}
            {tab.id === 'chat' && showChatBadge && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-cic-red ring-2 ring-cic-white" />
            )}
          </span>
          {tab.label}
        </button>
      ))}
    </div>
  )
}
