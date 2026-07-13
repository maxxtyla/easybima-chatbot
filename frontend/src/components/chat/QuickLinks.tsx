'use client'

import React from 'react'
import { QuickLink } from '@/types/chat'
import { QuickLinkIcon } from './QuickLinkIcon'
import { ChevronRightIcon } from './UiIcons'
import { QUICK_LINKS } from '@/lib/quickLinks'

interface QuickLinksProps {
  onNavigate?: (link: QuickLink) => void
}

export function QuickLinks({ onNavigate }: QuickLinksProps) {
  const handleClick = (link: QuickLink) => {
    if (onNavigate) {
      onNavigate(link)
      return
    }
    const isExternal = /^https?:\/\//.test(link.url)
    if (isExternal) window.open(link.url, '_blank', 'noopener,noreferrer')
    else window.location.href = link.url
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-cic-gray">QuickLinks</h3>
      </div>

      <div className="px-2 pb-2 space-y-1.5">
        {QUICK_LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            onClick={() => handleClick(link)}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-red-50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-red-50 text-cic-red flex items-center justify-center flex-shrink-0">
              <QuickLinkIcon icon={link.icon} className="w-4 h-4" />
            </div>
            <span className="flex-1 text-sm font-medium text-cic-gray truncate">{link.label}</span>
            <ChevronRightIcon className="w-4 h-4 text-neutral-300 flex-shrink-0 group-hover:text-cic-red transition-colors" />
          </button>
        ))}
      </div>
    </div>
  )
}
