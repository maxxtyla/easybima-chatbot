import type { Metadata } from 'next'
import '@/styles/globals.css'
import { ClientProviders } from './providers'

export const metadata: Metadata = {
  title: 'CIC Insurance |  Bima AI Chat Support',
  description: 'Get instant support from CIC Insurance with our AI-powered chatbot. Fast, reliable, and always available.',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
  icons: {
    // Use the CIC logo placed in the public folder as the site icon
    icon: '/cic-logo.png',
    apple: '/cic-logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
