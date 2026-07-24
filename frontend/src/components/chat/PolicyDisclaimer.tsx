'use client'

import React from 'react'
import { PRIVACY_POLICY_URL } from '@/lib/config'

interface PolicyDisclaimerProps {
  onDismiss: () => void
}

/**
 * Small "by chatting here, you agree…" notice shown once the customer
 * sends their first message (see ChatWindow — visibility/dismissal is
 * driven from there and persisted per-session so it doesn't reappear on
 * every subsequent message or page refresh).
 */
export function PolicyDisclaimer({ onDismiss }: PolicyDisclaimerProps) {
  return (
    <div className="mx-2.5 mb-2 flex items-start gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-[11px] leading-snug text-neutral-600 animate-fade-in">
      <p className="flex-1">
        By chatting here, you agree we and authorized partners may process, monitor, and record this
        chat and your data in line with{' '}
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-cic-red"
        >
          Privacy Policy
        </a>
        .
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 transition-colors leading-none"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
