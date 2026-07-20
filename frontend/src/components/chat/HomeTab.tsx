'use client'

import React from 'react'
import { ProductAdCarousel } from './ProductAdCarousel'
import { WhatsAppIcon, XSocialIcon, FacebookIcon, YoutubeIcon, InstagramIcon, ChevronRightIcon, MessageIcon } from './UiIcons'
import { getWhatsAppChatUrl, SOCIAL_LINKS } from '@/lib/config'

interface HomeTabProps {
  onStartChat: () => void
  hasActiveConversation: boolean
}

export function HomeTab({ onStartChat, hasActiveConversation }: HomeTabProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-cic-light">
      {/* -- Hero: Bima's greeting -- */}
      <div className="relative overflow-hidden bg-gradient-to-br from-cic-red via-cic-red to-cic-red-dark px-4 pt-5 pb-6">
        {/* Decorative ambient blobs -- keeps the hero feeling alive without a stock photo */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl animate-float-slow" aria-hidden="true" />
        <div className="absolute -bottom-16 -left-10 w-44 h-44 rounded-full bg-cic-red-light/30 blur-2xl animate-float-slower" aria-hidden="true" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          aria-hidden="true"
          style={{
            backgroundImage: 'radial-gradient(circle, #FFFFFF 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        />

        <div className="relative flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-ping-slow" aria-hidden="true" />
            <div className="relative w-14 h-14 rounded-full bg-white p-1 shadow-lg ring-2 ring-white/30">
              <img src="/bima-avatar.svg" alt="Bima" className="w-full h-full" />
            </div>
            <span
              className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-cic-red"
              aria-hidden="true"
            />
          </div>

          <div className="flex-1 pt-0.5">
            <div className="inline-flex items-center gap-1.5 mb-1 px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-semibold tracking-wide text-white/90 uppercase">
                AI Assistant &middot; Online
              </span>
            </div>
            <h2 className="text-lg font-bold text-white leading-tight">Hi there 👋 I&apos;m Bima</h2>
            <p className="text-xs text-red-50/90 leading-relaxed mt-1">
              CIC Insurance&apos;s AI assistant. Ask me anything, or jump straight to what you need below.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5 -mt-1">
        {/* -- Product adverts -- */}
        <div className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Explore CIC products
            </h3>
          </div>
          <ProductAdCarousel />
        </div>

        <button
          type="button"
          onClick={onStartChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white border border-neutral-200 hover:border-cic-red hover:shadow-chat-bubble transition-all text-left"
        >
          <div className="w-9 h-9 rounded-full bg-red-50 text-cic-red flex items-center justify-center flex-shrink-0">
            <MessageIcon className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-cic-gray">
              {hasActiveConversation ? 'Continue conversation' : 'Start a conversation'}
            </p>
            <p className="text-xs text-neutral-500">Chat with Bima or a live agent</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-300 flex-shrink-0" />
        </button>


        <a
          href={getWhatsAppChatUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cic-gray">Reach us on WhatsApp</p>
              <p className="text-xs text-neutral-500">Chat with customer care</p>
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        </a>

        <a
          href={SOCIAL_LINKS.x}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-black/5 border border-black/20 hover:bg-black/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0">
              <XSocialIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cic-gray">Follow us on X</p>
              <p className="text-xs text-neutral-500">Latest news and updates</p>
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        </a>

        <a
          href={SOCIAL_LINKS.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#1877F2]/10 border border-[#1877F2]/30 hover:bg-[#1877F2]/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1877F2] text-white flex items-center justify-center flex-shrink-0">
              <FacebookIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cic-gray">Follow us on Facebook</p>
              <p className="text-xs text-neutral-500">Latest news and updates</p>
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        </a>

        <a
          href={SOCIAL_LINKS.youtube}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-black/5 border border-black/20 hover:bg-black/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0">
              <YoutubeIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cic-gray">Subscribe to our Youtube</p>
              <p className="text-xs text-neutral-500">Latest news and updates</p>
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        </a>

        <a
          href={SOCIAL_LINKS.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#E4405F]/10 border border-[#E4405F]/30 hover:bg-[#E4405F]/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white flex items-center justify-center flex-shrink-0">
              <InstagramIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cic-gray">Follow us on Instagram</p>
              <p className="text-xs text-neutral-500">Latest news and updates</p>
            </div>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        </a>
      </div>
    </div>
  )
}
