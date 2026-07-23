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
  /** Path (under /public) to the product photo shown behind the card copy. */
  image: string
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
    image: '/product-ads/easybima.jpg',
  },
  {
    id: 'coopcare',
    eyebrow: 'Medical · Cover',
    title: 'Healthcare that has your back',
    blurb: 'Individual & family medical cover with a wide hospital network across Kenya.',
    cta: 'Explore health cover',
    url: 'https://ke.cicinsurancegroup.com/individual-solutions/',
    icon: 'health',
    theme: 'teal',
    image: '/product-ads/pharmacy.jpg',
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
    image: '/product-ads/academia.jpg',
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
    image: '/product-ads/mmf.jpg',
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
    image: '/product-ads/home.jpg',
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
    image: '/product-ads/retirement.jpg',
  },
]

export interface FeaturedAd {
  id: string
  eyebrow: string
  title: string
  blurb: string
  cta: string
  image: string
  url: string
  alt: string
}

/**
 * Full-creative ads (own headline/CTA baked into the image) shown one at a
 * time, auto-alternating, in the empty Conversation tab. Add more objects
 * here to bring more ads into rotation — no other code changes required.
 */
export const FEATURED_ADS: FeaturedAd[] = [
  {
    id: 'ushirika',
    eyebrow: 'Ushirika Gardens',
    title: '200-acre gated community development',
    blurb: 'To provide you with an ideal canvas to build your dream home. To create an outstanding gated community that will be enjoyed and admired for generations to come.',
    cta: '200-acre gated community development',
    image: '/product-ads/ushirikagardens.jpg',
    url: 'https://ushirikagardens.cic.co.ke',
    alt: 'Ushirika Gardens is a premier, 200-acre gated community development in Kiambu County, Kenya, wholly owned by the CIC Group .',
  },
  {
    id: 'academia',
    eyebrow: 'Afya Bora',
    title: 'Quality health care at the hospital level',
    blurb: 'The cover provides in-patient and outpatient benefits for a family of up to 6 members with an in-patient cover limit of Kshs.250,000 and out-patient limit of Kshs.50,000.',
    cta: 'Medical Cover',
    image: '/product-ads/afyabora.jpg',
    url: 'https://ke.cicinsurancegroup.com/cooperatives-solutions/afya-bora/',
    alt: "CIC Academia Policy — nothing interrupts your child's education",
  },
  {
    id: 'retirement',
    eyebrow: 'Seniors Mediplan',
    title: 'Medical Cover built for Comfort in Old Age.',
    blurb: 'Medical cover designed for senior citizens who are the most vulnerable to illness, pain and related medical conditions. The cover protects them against medical expenses and gives them comfort in old age.',
    cta: 'Medical Cover built for Comfort in Old Age.',
    image: '/product-ads/seniorsmediplan.jpg',
    url: 'https://ke.cicinsurancegroup.com/individual-solutions/health-solutions/?tab=seniors-mediplan',
    alt: 'CIC Jiapnge Pension Plan — do not wait to retire, prepare for it',
  },
  {
    id: 'pharmacy',
    eyebrow: 'CIC · Pharmacy',
    title: '',
    blurb: 'CIC Pharmacy open Monday to Sunday, 7am to 7pm',
    cta: 'CIC ',
    image: '/product-ads/pharmacy2.jpg',
    url: 'https://ke.cicinsurancegroup.com/pharmacy/',
    alt: 'CIC Pharmacy — now open Monday to Sunday, 7am to 7pm',
  },
]
