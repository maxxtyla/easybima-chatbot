'use client'

import React from 'react'
import { PRODUCT_ADS, AdTheme } from '@/lib/productAds'
import { ProductGlyph } from './ProductIllustrations'
import { ChevronRightIcon } from './UiIcons'
import { cn } from '@/lib/utils'

// Tailwind needs full class strings at build time, so themes are mapped to
// pre-written class lists rather than assembled with template strings.
const THEME_STYLES: Record<AdTheme, { bg: string; blobA: string; blobB: string; badge: string }> = {
  red: {
    bg: 'bg-gradient-to-br from-cic-red via-cic-red to-cic-red-dark',
    blobA: 'bg-white/15',
    blobB: 'bg-cic-red-light/40',
    badge: 'bg-white/20 text-white',
  },
  crimson: {
    bg: 'bg-gradient-to-br from-cic-red-light via-cic-red to-cic-plum',
    blobA: 'bg-white/15',
    blobB: 'bg-cic-plum/40',
    badge: 'bg-white/20 text-white',
  },
  plum: {
    bg: 'bg-gradient-to-br from-cic-plum via-cic-red-dark to-cic-gray',
    blobA: 'bg-cic-gold/25',
    blobB: 'bg-white/10',
    badge: 'bg-white/15 text-white',
  },
  teal: {
    bg: 'bg-gradient-to-br from-cic-teal via-cic-teal to-cic-teal-dark',
    blobA: 'bg-white/15',
    blobB: 'bg-cic-gold/25',
    badge: 'bg-white/20 text-white',
  },
  gold: {
    bg: 'bg-gradient-to-br from-cic-gold via-cic-gold-dark to-cic-plum',
    blobA: 'bg-white/20',
    blobB: 'bg-cic-red/25',
    badge: 'bg-white/25 text-white',
  },
  garnet: {
    bg: 'bg-gradient-to-br from-cic-red-dark via-cic-plum to-cic-gray',
    blobA: 'bg-cic-teal/25',
    blobB: 'bg-white/10',
    badge: 'bg-white/15 text-white',
  },
}

const AUTOPLAY_MS = 4200
const RESUME_AFTER_MS = 6000

interface ProductAdCarouselProps {
  compact?: boolean
  className?: string
}

export function ProductAdCarousel({ compact, className }: ProductAdCarouselProps) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const pausedRef = React.useRef(false)
  const resumeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToIndex = React.useCallback((index: number) => {
    const track = trackRef.current
    if (!track) return
    const card = track.children[index] as HTMLElement | undefined
    if (!card) return
    track.scrollTo({ left: card.offsetLeft - 16, behavior: 'smooth' })
  }, [])

  // Autoplay — advances one card at a time and loops back to the start.
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return
      setActiveIndex((prev) => {
        const next = (prev + 1) % PRODUCT_ADS.length
        scrollToIndex(next)
        return next
      })
    }, AUTOPLAY_MS)
    return () => clearInterval(interval)
  }, [scrollToIndex])

  // Pause autoplay while the person is actively swiping/scrolling, and
  // resume a few seconds after they let go.
  const pause = React.useCallback(() => {
    pausedRef.current = true
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
  }, [])

  const scheduleResume = React.useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false
    }, RESUME_AFTER_MS)
  }, [])

  // Keep the dot indicator in sync when the person swipes manually.
  const handleScroll = React.useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const cardWidth = (track.children[0] as HTMLElement)?.offsetWidth || 1
    const index = Math.round(track.scrollLeft / (cardWidth + 12))
    setActiveIndex(Math.max(0, Math.min(index, PRODUCT_ADS.length - 1)))
  }, [])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={pause}
        onPointerUp={scheduleResume}
        onPointerLeave={scheduleResume}
        onTouchStart={pause}
        onTouchEnd={scheduleResume}
        className="ad-carousel-track gap-3 px-4 -mx-4 pb-1"
        role="list"
        aria-label="CIC Insurance product adverts"
      >
        {PRODUCT_ADS.map((ad, i) => {
          const theme = THEME_STYLES[ad.theme]
          return (
            <a
              key={ad.id}
              href={ad.url}
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
              aria-label={`${ad.title} — ${ad.cta}`}
              className={cn(
                'ad-carousel-card group relative flex-shrink-0 overflow-hidden rounded-2xl text-white',
                'shadow-chat-bubble hover:shadow-lg transition-shadow duration-300',
                'w-[78%] sm:w-[260px]',
                compact ? 'h-[120px]' : 'h-[136px]'
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={cn('absolute inset-0', theme.bg)} />
              {/* Decorative blurred blobs — stand in for a product photo
                  without depending on external, licensable imagery. */}
              <div
                className={cn(
                  'absolute -right-4 -top-6 w-24 h-24 rounded-full blur-xl opacity-80 animate-float-slow',
                  theme.blobA
                )}
                aria-hidden="true"
              />
              <div
                className={cn(
                  'absolute -bottom-8 -left-6 w-28 h-28 rounded-full blur-xl opacity-70 animate-float-slower',
                  theme.blobB
                )}
                aria-hidden="true"
              />
              <div className="absolute inset-0 sheen opacity-0 group-hover:opacity-100 group-hover:animate-shimmer transition-opacity duration-300" aria-hidden="true" />

              <div className="relative h-full flex flex-col justify-between p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 ring-1 ring-white/25">
                      <ProductGlyph icon={ad.icon} className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
                      {ad.eyebrow}
                    </span>
                  </div>
                  {ad.badge && (
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', theme.badge)}>
                      {ad.badge}
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold leading-snug mb-0.5">{ad.title}</h4>
                  {!compact && (
                    <p className="text-[11px] leading-snug text-white/85 line-clamp-2">{ad.blurb}</p>
                  )}
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
                    {ad.cta}
                    <ChevronRightIcon className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </a>
          )
        })}
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-2.5" role="tablist" aria-label="Advert slide indicators">
        {PRODUCT_ADS.map((ad, i) => (
          <button
            key={ad.id}
            type="button"
            role="tab"
            aria-selected={activeIndex === i}
            aria-label={`Show ${ad.title} advert`}
            onClick={() => {
              pause()
              scrollToIndex(i)
              setActiveIndex(i)
              scheduleResume()
            }}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              activeIndex === i ? 'w-5 bg-cic-red' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'
            )}
          />
        ))}
      </div>
    </div>
  )
}
