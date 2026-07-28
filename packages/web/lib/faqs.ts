export const FAQS = [
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
