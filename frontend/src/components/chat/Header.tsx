'use client'

import React from 'react'

interface HeaderProps {
  onClose?: () => void
}

export function Header({ onClose }: HeaderProps) {
  return (
    <div className="bg-cic-red text-cic-white px-4 py-4 flex items-center justify-between rounded-t-lg shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-cic-white rounded-full flex items-center justify-center overflow-hidden">
          <img src="/cic-logo.png" alt="CIC" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <h2 className="font-semibold text-base">Bima CIC'S AI Support</h2>
          <p className="text-xs text-red-100">Online and ready to help</p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-cic-white hover:opacity-80 transition-opacity"
          aria-label="Close chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
