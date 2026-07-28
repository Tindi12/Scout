'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'

import { FAQS } from '@/lib/faqs'
import { cn } from '@/lib/utils'

export { FAQS }

/** Shared accordion used by the landing FAQ section and the dedicated /faq page. */
export function FaqAccordion({ className }: { className?: string }) {
  return (
    <Accordion.Root
      type="single"
      collapsible
      className={cn('space-y-2 sm:space-y-4', className)}
    >
      {FAQS.map((item, i) => (
        <Accordion.Item
          key={item.q}
          value={`item-${i}`}
          className="glass-card overflow-hidden rounded-xl transition-colors duration-300 data-[state=open]:bg-white/[0.04] sm:rounded-2xl"
        >
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-3 px-3.5 py-3.5 text-left sm:gap-4 sm:px-7 sm:py-6">
              <span className="font-headline text-[13.5px] font-medium leading-snug text-white sm:text-[17px]">
                {item.q}
              </span>
              <ChevronDown
                className="h-5 w-5 shrink-0 text-[#A1A1AA] transition-all duration-300 group-data-[state=open]:rotate-180 group-data-[state=open]:text-[#FF6733]"
                strokeWidth={1.75}
                aria-hidden
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
            <div className="px-3.5 pb-3.5 font-body text-[13.5px] leading-relaxed text-[#A1A1AA] sm:px-7 sm:pb-6 sm:text-[15px]">
              {item.a}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}

/** Landing-page FAQ section (desktop experience). */
export function FAQ() {
  return (
    <section id="faq" className="relative px-6 py-10 sm:px-6 sm:py-16 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center sm:mb-12">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
            FAQ
          </p>
          <h2 className="mt-2.5 font-headline text-[1.375rem] font-medium leading-snug tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl md:text-5xl">
            Answers to the questions we hear most
          </h2>
        </div>

        <FaqAccordion />
      </div>
    </section>
  )
}
