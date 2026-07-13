'use client'

import React from 'react'
import { QuickLinkIconKey } from '@/types/chat'

interface QuickLinkIconProps {
  icon: QuickLinkIconKey
  className?: string
}

const PATHS: Record<QuickLinkIconKey, React.ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 9.5h18" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M16 13.5h2.5" />
    </>
  ),
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />,
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5.1 5.1l3.2 3.2M15.7 15.7l3.2 3.2M18.9 5.1l-3.2 3.2M8.3 15.7l-3.2 3.2" />
    </>
  ),
  link: <path d="M9 15l6-6M8.5 12.5l-2 2a3 3 0 104.2 4.2l2-2M15.5 11.5l2-2a3 3 0 10-4.2-4.2l-2 2" />,
  phone: (
    <path d="M4.5 4.5h3.2l1.6 4.2-2 1.6a12 12 0 006.4 6.4l1.6-2 4.2 1.6v3.2c0 1-.9 1.6-1.8 1.4A17 17 0 013 6.3c-.2-.9.4-1.8 1.5-1.8z" />
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v5h5" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-9z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L12 3.5z" />,
}

export function QuickLinkIcon({ icon, className }: QuickLinkIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[icon]}
    </svg>
  )
}

export const QUICK_LINK_ICON_KEYS: QuickLinkIconKey[] = [
  'calendar',
  'wallet',
  'shield',
  'lifebuoy',
  'link',
  'phone',
  'mail',
  'file',
  'home',
  'star',
]
