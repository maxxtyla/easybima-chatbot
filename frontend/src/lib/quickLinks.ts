import { QuickLink } from '@/types/chat'

/**
 * The links shown in the widget's "Explore" section (Home tab).
 * Edit this array directly to add, remove, or change entries —
 * there's no in-widget editor, so this file is the single source
 * of truth for customers.
 *
 *   id:    unique, stable string (used as the React key)
 *   label: text shown to the customer
 *   url:   absolute "https://..." opens in a new tab,
 *          a relative "/path" navigates within the current site
 *   icon:  one of the keys in QuickLinkIcon.tsx —
 *          'calendar' | 'wallet' | 'shield' | 'lifebuoy' | 'link' |
 *          'phone' | 'mail' | 'file' | 'home' | 'star'
 */
export const QUICK_LINKS: QuickLink[] = [
  { id: 'appointment', label: 'Get an insurance quote', url: 'https://easybima.cic.co.ke', icon: 'shield' },
  { id: 'mmf', label: 'Open MMF Account', url: 'https://cicamselfservice.cic.co.ke', icon: 'wallet' },
  { id: 'buy-insurance', label: 'Pension Plan', url: 'https://ke.cicinsurancegroup.com/business-solutions/retirement-solutions', icon: 'lifebuoy' },
  /* { id: 'om-rescue', label: 'Get OM Rescue', url: '/om-rescue', icon: 'lifebuoy' }, */
]
