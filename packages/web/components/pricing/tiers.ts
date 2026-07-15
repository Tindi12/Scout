import type { SubscriptionPlan } from '@/lib/subscription-plan'

export type PricingFeature = { label: string; emphasis?: boolean }

export type PricingTier = {
  id: SubscriptionPlan
  name: string
  price: string
  period: string
  limitLine: string
  blurb: string
  popular?: boolean
  features: PricingFeature[]
}

/** Card content. Mirrors the landing pricing component + the Epic 10 spec so the
 * pitch stays consistent everywhere. */
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    limitLine: '10 lifetime applications',
    blurb:
      'Try Scout’s resume intelligence and job matching before you let the agent loose.',
    features: [
      { label: '10 lifetime applications' },
      { label: 'Resume parsing, scoring & analysis' },
      { label: 'Job discovery & matching' },
      { label: 'Scout Copilot — 5 messages / day' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$14.99',
    period: '/month',
    limitLine: '40 applications / 30 days',
    blurb:
      'Unleash the full agent. Tailored resumes for every role, applied autonomously while you sleep.',
    popular: true,
    features: [
      { label: 'Everything in Free, plus:' },
      { label: '40 applications / 30 days', emphasis: true },
      { label: 'Scout Agent auto-apply (Greenhouse, Lever, Ashby)', emphasis: true },
      { label: 'Resume rewrite + job-tailored resumes (LaTeX PDF)' },
      { label: 'Unlimited Scout Copilot' },
      { label: 'pgvector semantic matching' },
      { label: 'Application tracker (Kanban) + follow-ups' },
    ],
  },
  {
    id: 'scout_plus',
    name: 'Scout+',
    price: '$29.99',
    period: '/month',
    limitLine: '100 applications / 30 days',
    blurb:
      'Maximum volume, priority support, and first access when Scout ships something new.',
    features: [
      { label: 'Everything in Pro, plus:' },
      { label: '100 applications / 30 days (2.5× Pro volume)', emphasis: true },
      { label: 'Priority support' },
      { label: 'Early access to new features' },
      { label: 'Advanced analytics' },
    ],
  },
]

export type ComparisonValue = boolean | string

export type ComparisonRow = {
  label: string
  free: ComparisonValue
  pro: ComparisonValue
  scoutPlus: ComparisonValue
}

export type ComparisonGroup = {
  category: string
  rows: ComparisonRow[]
}

/** Feature comparison chart, grouped by category (reference image 2). Values are
 * either a checkmark (boolean) or a per-tier string like "10 / 40 / 100". */
export const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    category: 'Applications',
    rows: [
      {
        label: 'Application volume',
        free: '10 lifetime',
        pro: '40 / 30 days',
        scoutPlus: '100 / 30 days',
      },
      {
        label: 'Scout Agent auto-apply (Greenhouse, Lever, Ashby)',
        free: false,
        pro: true,
        scoutPlus: true,
      },
      {
        label: 'Application tracker (Kanban) + follow-ups',
        free: false,
        pro: true,
        scoutPlus: true,
      },
    ],
  },
  {
    category: 'Resume Tools',
    rows: [
      {
        label: 'Resume parsing, scoring & analysis',
        free: true,
        pro: true,
        scoutPlus: true,
      },
      {
        label: 'Resume rewrite (Jake format)',
        free: false,
        pro: true,
        scoutPlus: true,
      },
      {
        label: 'Job-tailored resumes (LaTeX PDF)',
        free: false,
        pro: true,
        scoutPlus: true,
      },
    ],
  },
  {
    category: 'Job Discovery',
    rows: [
      {
        label: 'Job discovery & matching',
        free: true,
        pro: true,
        scoutPlus: true,
      },
      {
        label: 'pgvector semantic matching',
        free: false,
        pro: true,
        scoutPlus: true,
      },
      {
        label: 'Advanced analytics',
        free: false,
        pro: false,
        scoutPlus: true,
      },
      {
        label: 'Early access to new features',
        free: false,
        pro: false,
        scoutPlus: true,
      },
    ],
  },
  {
    category: 'Copilot',
    rows: [
      {
        label: 'Scout AI Copilot',
        free: '5 / day',
        pro: 'Unlimited',
        scoutPlus: 'Unlimited',
      },
    ],
  },
  {
    category: 'Support',
    rows: [
      {
        label: 'Support',
        free: 'Standard',
        pro: 'Standard',
        scoutPlus: 'Priority',
      },
    ],
  },
]
