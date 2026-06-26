import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

import { Providers } from './providers'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Scout - Never Apply Again.',
  description:
    'Scout is the autonomous AI agent that parses your resume, tailors it for every role, and applies on your behalf — so you can stop filling out forms and start interviewing.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#FF6733',
          colorBackground: '#000000',
          colorText: '#ffffff',
          colorTextSecondary: '#A1A1AA',
          borderRadius: '0.75rem',
          fontFamily: 'var(--font-manrope)',
        },
      }}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`dark scroll-smooth ${manrope.variable} ${inter.variable}`}
      >
        <body
          className="bg-black font-body text-white antialiased selection:bg-[#FF6733]/30 selection:text-white"
          suppressHydrationWarning
        >
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
