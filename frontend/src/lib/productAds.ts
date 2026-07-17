import { ProductIconKey } from '@/components/chat/ProductIllustrations'

export type AdTheme = 'red' | 'plum' | 'teal' | 'gold' | 'crimson' | 'garnet'

export interface ProductAd {
  id: string
  eyebrow: string
  title: string
  blurb: string
  cta: string
  url: string
  icon: ProductIconKey
  theme: AdTheme
  badge?: string
}

/**
 * Adverts shown in the widget's "before you chat" surfaces (Home tab hero
 * and the empty Conversation tab). Sourced from CIC Insurance Group's own
 * product lines — keep URLs pointed at real CIC domains, matching the
 * entries already used in quickLinks.ts.
 */
export const PRODUCT_ADS: ProductAd[] = [
  {
    id: 'easybima',
    eyebrow: 'Motor · Easy Bima',
    title: 'Motor cover in minutes',
    blurb: 'Get a quote and pay online — comprehensive or third‑party, no branch visit needed.',
    cta: 'Get a quote',
    url: 'https://easybima.cic.co.ke',
    icon: 'motor',
    theme: 'red',
    badge: 'Most popular',
  },
  {
    id: 'coopcare',
    eyebrow: 'Medical · CoopCare',
    title: 'Healthcare that has your back',
    blurb: 'Individual & family medical cover with a wide hospital network across Kenya.',
    cta: 'Explore health cover',
    url: 'https://ke.cicinsurancegroup.com/individual-solutions/',
    icon: 'health',
    theme: 'teal',
  },
  {
    id: 'academia',
    eyebrow: 'Life · CIC Academia',
    title: "Secure your child's education",
    blurb: 'A savings‑linked policy that keeps school fees covered, whatever life brings.',
    cta: 'Plan for their future',
    url: 'https://ke.cicinsurancegroup.com/individual-solutions/',
    icon: 'education',
    theme: 'gold',
  },
  {
    id: 'mmf',
    eyebrow: 'Asset Management',
    title: 'Make your money grow daily',
    blurb: 'Open a Money Market Fund account and earn competitive returns with easy withdrawals.',
    cta: 'Open MMF account',
    url: 'https://cicamselfservice.cic.co.ke',
    icon: 'savings',
    theme: 'plum',
  },
  {
    id: 'home',
    eyebrow: 'General · Home Insurance',
    title: 'Protect the roof over your head',
    blurb: 'Cover for your home and its contents against fire, theft, and the unexpected.',
    cta: 'Cover your home',
    url: 'https://ke.cicinsurancegroup.com/individual-solutions/',
    icon: 'home',
    theme: 'crimson',
  },
  {
    id: 'retirement',
    eyebrow: 'Pensions · Retirement',
    title: 'Retire on your own terms',
    blurb: 'Pension and annuity solutions built to give you a steady income later in life.',
    cta: 'See retirement plans',
    url: 'https://ke.cicinsurancegroup.com/business-solutions/retirement-solutions',
    icon: 'pension',
    theme: 'garnet',
  },
]
