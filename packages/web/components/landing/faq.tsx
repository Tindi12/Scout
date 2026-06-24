'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'How does Scout actually apply to jobs for me?',
    a: 'Scout spins up cloud browser sessions through Browserbase and routes each application through portal-specific agents (Greenhouse, Lever, Workday). The agent fills your name, contact info, custom questions, and uploads your tailored resume PDF — then submits. You get a live status feed showing every step in real time.',
  },
  {
    q: 'Do I get a different resume for every job?',
    a: 'Yes — that\'s the entire point. Pro generates a job-specific rewrite per role using the Job Description\'s exact keywords, compiles it as a Jake-format LaTeX PDF, and caches the result so each application is uniquely tailored without rewrites costing you tokens twice.',
  },
  {
    q: 'Will using an AI agent get me blacklisted or banned?',
    a: 'No. Scout submits the same forms a human would — no scraping, no spamming, no spoofing. Applications run one at a time per portal at a natural, human pace with throttling between requests, so portals only ever see normal activity. And CAPTCHAs? Fully handled. Scout runs on enterprise-grade Browserbase infrastructure that detects and clears verification challenges automatically in the background — you never have to watch, wait, or solve anything yourself. It\'s all covered, start to finish.',
  },
  {
    q: 'What do I actually get on the free plan?',
    a: 'Resume parsing for PDF and DOCX, the full Scout Score with weakness diagnosis across all four dimensions, browse matched internships across portals, and 5 lifetime AI Copilot messages. No credit card required — you only upgrade when you\'re ready to let the agent apply for you.',
  },
] as const

export function FAQ() {
  return (
    <section id="faq" className="relative px-6 py-32 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-14 text-center">
          <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            FAQ
          </p>
          <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
            Find answers for the most
            <br className="hidden md:block" /> asked questions
          </h2>
        </div>

        <Accordion.Root type="single" collapsible className="space-y-4">
          {FAQS.map((item, i) => (
            <Accordion.Item
              key={item.q}
              value={`item-${i}`}
              className="glass-card overflow-hidden rounded-2xl transition-colors duration-300 data-[state=open]:bg-white/[0.04]"
            >
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-7 py-6 text-left">
                  <span className="font-headline text-[17px] font-medium text-white">
                    {item.q}
                  </span>
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-[#A1A1AA] transition-all duration-300 group-data-[state=open]:rotate-180 group-data-[state=open]:text-[#FF6733]"
                    strokeWidth={1.75}
                  />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="px-7 pb-6 font-body text-[15px] leading-relaxed text-[#A1A1AA]">
                  {item.a}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  )
}
