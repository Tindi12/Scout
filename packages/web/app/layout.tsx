import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'

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
    <html
      lang="en"
      className={`dark scroll-smooth ${manrope.variable} ${inter.variable}`}
    >
      <body className="bg-black font-body text-white antialiased selection:bg-[#FF6733]/30 selection:text-white">
        {children}
      </body>
    </html>
  )
}
