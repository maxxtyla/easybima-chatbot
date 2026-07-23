'use client'

import React from 'react'
import Image from 'next/image'
import { FEATURED_ADS } from '@/lib/productAds'
import { cn } from '@/lib/utils'

const ROTATE_MS = 4500

interface FeaturedAdRotatorProps {
  className?: string
  edgeToEdge?: boolean
}

export function FeaturedAdRotator({ className, edgeToEdge }: FeaturedAdRotatorProps) {
  const [activeIndex, setActiveIndex] = React.useState(0)

  React.useEffect(() => {
    if (FEATURED_ADS.length <= 1) return
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FEATURED_ADS.length)
    }, ROTATE_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className={cn(
        // min-h-[180px] allows it to fit compact containers, h-full flex flex-col ensures container fill
        'relative w-full h-full min-h-[180px] overflow-hidden select-none flex flex-col',
        edgeToEdge ? '' : 'rounded-2xl shadow-chat-bubble ring-1 ring-neutral-100',
        className
      )}
    >
      {FEATURED_ADS.map((ad, i) => (
        <a
          key={ad.id}
          href={ad.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ad.alt}
          aria-hidden={i !== activeIndex}
          tabIndex={i === activeIndex ? 0 : -1}
          className={cn(
            'absolute inset-0 flex flex-col justify-end transition-opacity duration-700 ease-in-out',
            i === activeIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          )}
        >
          <Image
            src={ad.image}
            alt={ad.alt}
            fill
            sizes="(min-width: 640px) 400px, 90vw"
            className="object-cover"
            priority={i === 0}
          />
          
          {/* Gradient Scrim */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"
            aria-hidden="true"
          />

          {/* Text Content Block - Reduced padding and tightened vertical margins */}
          <div className="relative z-10 p-3 pb-5 text-left flex flex-col justify-end">
            <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-white/80 mb-0.5">
              {ad.eyebrow}
            </span>
            <h3 className="text-base font-bold text-white leading-tight mb-0.5 line-clamp-1">
              {ad.title}
            </h3>
            <p className="text-xs text-white/85 leading-snug mb-2 line-clamp-2">
              {ad.blurb}
            </p>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1">
                {ad.cta}
              </span>
            </div>
          </div>
        </a>
      ))}

      {/* Progress Dots */}
      {FEATURED_ADS.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 pointer-events-none">
          {FEATURED_ADS.map((ad, i) => (
            <span
              key={ad.id}
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i === activeIndex ? 'w-3.5 bg-white' : 'w-1 bg-white/50'
              )}
              aria-hidden="true"
            />
          ))}
        </div>
      )}
    </div>
  )
}