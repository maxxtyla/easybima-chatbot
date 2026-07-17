'use client'

import React from 'react'

type IconProps = { className?: string }

// Shared stroke settings so every product glyph in the advert carousel
// reads as one family, regardless of what it depicts.
const glyph = {
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

/** Motor Private / Motor Commercial / Easy Bima */
export function MotorGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M6 29l3.2-9.6A4 4 0 0113 16.5h22a4 4 0 013.8 2.9L42 29" />
      <path d="M4.5 29h39a1.5 1.5 0 011.5 1.5V35a2 2 0 01-2 2h-3" />
      <path d="M7.5 37h-2a2 2 0 01-2-2v-4.5" />
      <circle cx="14" cy="37" r="3.4" />
      <circle cx="34" cy="37" r="3.4" />
      <path d="M12 23.5h9M25 23.5h9" strokeWidth="2" />
    </svg>
  )
}

/** Home Insurance */
export function HomeGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M7 22.5L24 8l17 14.5" />
      <path d="M11 19v18a1.5 1.5 0 001.5 1.5h7V29a2 2 0 012-2h5a2 2 0 012 2v9.5h7A1.5 1.5 0 0037 37V19" />
      <path d="M29 8v4.5" />
    </svg>
  )
}

/** Medical / CoopCare Health / Seniors Mediplan */
export function HealthGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M24 39s-13-8-15.8-15.4C6 17.8 9 12.5 14.6 12c3-.3 5.8 1.2 7.4 3.6.6.9 1.9.9 2.5 0C26 12.5 28.8 11 31.8 11.3c5.6.5 8.6 5.8 6.4 11.6C35.4 30.7 24 39 24 39z" />
      <path d="M17 24h4l2-4.5 3 9 2-4.5h4" strokeWidth="2" />
    </svg>
  )
}

/** CIC Academia — child education policy */
export function EducationGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M4 17L24 9l20 8-20 8L4 17z" />
      <path d="M13 21.5V31c0 2 5 5 11 5s11-3 11-5v-9.5" />
      <path d="M40 17v11" />
    </svg>
  )
}

/** Money Market Fund / Smart Saver — asset management */
export function SavingsGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M7 33.5V27a4 4 0 014-4h2.6l4-6.4a3 3 0 012.6-1.5H30a4 4 0 013.6 2.2l1.7 3.4L41 22v8" />
      <path d="M7 33.5h34M15 33.5V30M27 33.5V29" />
      <circle cx="30" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M6 39h5M20 39h8M33 39h9" strokeWidth="2" />
    </svg>
  )
}

/** Pension / Retirement Solutions */
export function PensionGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M24 6v6" />
      <path d="M8 21a16 16 0 0132 0z" />
      <path d="M8 21h32M24 21V38" />
      <path d="M17 38h14" />
      <path d="M24 12l2.6 4.5-2.6 2-2.6-2L24 12z" strokeWidth="2" />
    </svg>
  )
}

/** Personal Accident / Life protection — umbrella + shield hybrid, used as a spare */
export function ShieldGlyph({ className }: IconProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M24 5l16 6v10c0 10-6.8 17.5-16 22-9.2-4.5-16-12-16-22V11l16-6z" />
      <path d="M17 24l5 5 9-10" />
    </svg>
  )
}

export type ProductIconKey =
  | 'motor'
  | 'home'
  | 'health'
  | 'education'
  | 'savings'
  | 'pension'
  | 'shield'

export function ProductGlyph({ icon, className }: { icon: ProductIconKey; className?: string }) {
  switch (icon) {
    case 'motor':
      return <MotorGlyph className={className} />
    case 'home':
      return <HomeGlyph className={className} />
    case 'health':
      return <HealthGlyph className={className} />
    case 'education':
      return <EducationGlyph className={className} />
    case 'savings':
      return <SavingsGlyph className={className} />
    case 'pension':
      return <PensionGlyph className={className} />
    case 'shield':
      return <ShieldGlyph className={className} />
    default:
      return null
  }
}
