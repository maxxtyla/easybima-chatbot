'use client'

import React, { useState } from 'react'
import { ContactInfo } from '@/types/chat'

interface ContactInfoModalProps {
  ticketNumber?: string | null
  onSubmit: (contact: ContactInfo) => Promise<void> | void
  onSkip: () => void
  isSubmitting?: boolean
  errorMessage?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/

export function ContactInfoModal({
  ticketNumber,
  onSubmit,
  onSkip,
  isSubmitting,
  errorMessage,
}: ContactInfoModalProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    const trimmedEmail = email.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedEmail && !trimmedPhone) {
      setValidationError('Please enter an email or phone number so an agent can reach you.')
      return
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setValidationError('That email address doesn\'t look right.')
      return
    }
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setValidationError('That phone number doesn\'t look right.')
      return
    }

    onSubmit({ email: trimmedEmail || undefined, phone: trimmedPhone || undefined })
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-info-title"
      aria-describedby="contact-info-description"
    >
      <form
        onSubmit={handleSubmit}
        className="w-[88%] max-w-xs bg-cic-white rounded-xl shadow-xl p-5 animate-slide-up"
      >
        <h3 id="contact-info-title" className="text-base font-semibold text-cic-gray mb-1">
          How can we reach you?
        </h3>
        <p id="contact-info-description" className="text-sm text-neutral-600 mb-3">
          We&apos;re connecting you to a customer care agent{ticketNumber ? ` (${ticketNumber})` : ''}. Share your
          email or phone number so they can follow up with you directly.
        </p>

        <div className="space-y-2.5 mb-2">
          <div>
            <label htmlFor="contact-email" className="block text-xs font-medium text-neutral-500 mb-1">
              Email address
            </label>
            <input
              id="contact-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-sm px-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-cic-red/40 focus:border-cic-red disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="contact-phone" className="block text-xs font-medium text-neutral-500 mb-1">
              Phone number
            </label>
            <input
              id="contact-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-sm px-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-cic-red/40 focus:border-cic-red disabled:opacity-50"
            />
          </div>
        </div>

        {(validationError || errorMessage) && (
          <p className="text-xs text-cic-red mb-2">{validationError || errorMessage}</p>
        )}

        <p className="text-[11px] text-neutral-400 mb-4">
          At least one is required. We&apos;ll only use these to help with this request.
        </p>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onSkip}
            disabled={isSubmitting}
            className="px-3.5 py-2 text-sm font-medium rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3.5 py-2 text-sm font-medium rounded-lg text-cic-white bg-cic-red hover:bg-cic-red-dark transition-colors disabled:opacity-70"
          >
            {isSubmitting ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
