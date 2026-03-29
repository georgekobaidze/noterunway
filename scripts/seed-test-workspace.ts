#!/usr/bin/env ts-node
/**
 * NoteRunway — Realistic Test Workspace Seeder
 *
 * Generates a realistic small-startup Notion workspace for "Acme Labs".
 * Problems are embedded organically — duplicates appear as meeting notes
 * created twice, stale docs from old projects, credentials in setup guides, etc.
 *
 * Tests covered:
 *   ✓ Duplicate Detection   — meeting notes, project overviews, planning docs
 *   ✓ Garbage Collector     — empty pages, abandoned drafts, stale project docs
 *   ✓ Sensitive Data Finder — API keys, passwords, PII in HR/setup pages
 *   ✓ Dead Link Detector    — pages that reference a page we archive after seeding
 *   ✓ Link Density / Graph  — rich cross-linking between projects, meetings, eng docs
 *   ✓ Quick Stats           — nested hierarchy, recently edited, top-level pages
 *
 * Usage:
 *   NOTION_TOKEN=<token> npm run seed
 *
 * Cleanup: delete "Acme Labs" in Notion to remove everything.
 */

import { Client } from '@notionhq/client'

const TOKEN = process.env.NOTION_TOKEN
if (!TOKEN) {
  console.error('❌  Set NOTION_TOKEN environment variable first.')
  process.exit(1)
}

const notion = new Client({ auth: TOKEN })

// ─── Types ────────────────────────────────────────────────────────────────────

type RT =
  | { type: 'text'; text: { content: string }; annotations?: { bold?: boolean; code?: boolean; italic?: boolean } }
  | { type: 'mention'; mention: { type: 'page'; page: { id: string } } }

type Block =
  | { object: 'block'; type: 'paragraph';          paragraph:          { rich_text: RT[] } }
  | { object: 'block'; type: 'heading_1';           heading_1:          { rich_text: RT[] } }
  | { object: 'block'; type: 'heading_2';           heading_2:          { rich_text: RT[] } }
  | { object: 'block'; type: 'heading_3';           heading_3:          { rich_text: RT[] } }
  | { object: 'block'; type: 'bulleted_list_item';  bulleted_list_item: { rich_text: RT[] } }
  | { object: 'block'; type: 'numbered_list_item';  numbered_list_item: { rich_text: RT[] } }
  | { object: 'block'; type: 'code';                code:               { rich_text: RT[]; language: string } }
  | { object: 'block'; type: 'divider';             divider:            Record<string, never> }
  | { object: 'block'; type: 'callout';             callout:            { rich_text: RT[]; icon: { type: 'emoji'; emoji: string } } }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const t = (content: string, opts: { bold?: boolean; code?: boolean; italic?: boolean } = {}): RT => ({
  type: 'text', text: { content }, annotations: opts,
})
const m = (pageId: string): RT => ({ type: 'mention', mention: { type: 'page', page: { id: pageId } } })
const p = (...rts: RT[]): Block => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: rts } })
const h1 = (s: string): Block => ({ object: 'block', type: 'heading_1', heading_1: { rich_text: [t(s)] } })
const h2 = (s: string): Block => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [t(s)] } })
const h3 = (s: string): Block => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [t(s)] } })
const li = (s: string): Block => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [t(s)] } })
const nl = (s: string): Block => ({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [t(s)] } })
const code = (s: string, lang = 'shell'): Block => ({ object: 'block', type: 'code', code: { rich_text: [t(s)], language: lang } })
const divider = (): Block => ({ object: 'block', type: 'divider', divider: {} })
const callout = (emoji: string, ...rts: RT[]): Block => ({ object: 'block', type: 'callout', callout: { rich_text: rts, icon: { type: 'emoji', emoji } } })

async function mkpage(parentId: string, title: string, blocks: Block[] = []): Promise<string> {
  const page = await notion.pages.create({
    parent: { page_id: parentId },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: blocks as Parameters<typeof notion.pages.create>[0]['children'],
  })
  process.stdout.write(`  ✓ ${title}\n`)
  await new Promise(r => setTimeout(r, 250))
  return page.id
}

async function getAnyPageId(): Promise<string> {
  const res = await notion.search({ filter: { property: 'object', value: 'page' }, page_size: 1 })
  if (!res.results.length) throw new Error('No pages found. Grant your integration access to at least one page.')
  return res.results[0].id
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Seeding realistic Acme Labs workspace...\n')

  const anyPage = await getAnyPageId()

  // ── Root ────────────────────────────────────────────────────────────────────
  const root = await notion.pages.create({
    parent: { page_id: anyPage },
    properties: { title: { title: [{ type: 'text', text: { content: 'Acme Labs' } }] } },
    children: [
      callout('👋', t('Internal workspace for the Acme Labs team. Contains projects, docs, meeting notes, and team info.')),
    ] as Parameters<typeof notion.pages.create>[0]['children'],
  })
  const rootId = root.id
  console.log(`  ✓ Acme Labs (root: ${rootId})\n`)

  // ── Engineering ─────────────────────────────────────────────────────────────
  console.log('⚙️  Engineering...')
  const eng = await mkpage(rootId, 'Engineering')

  const devSetup = await mkpage(eng, 'Local Development Setup', [
    h1('Getting Started'),
    p(t('Follow this guide to set up your local dev environment from scratch.')),
    h2('Prerequisites'),
    li('Node.js 20+'),
    li('PostgreSQL 15'),
    li('Docker Desktop'),
    h2('Environment Variables'),
    p(t('Create a '), t('.env.local', { code: true }), t(' file in the project root:')),
    code(
      'DATABASE_URL=postgresql://acme_admin:Tr0ub4dor&3@localhost:5432/acme_dev\n' +
      'OPENAI_API_KEY=sk-proj-T3BlbkFJacme1234567890abcdefghijklmnopqrstuvwxyz\n' +
      'STRIPE_SECRET_KEY=sk_live_51NxAcmeLabs4eC2QaBcDeFgHiJkLmNoPqRsTuVwXyZ\n' +
      'JWT_SECRET=s3cr3t-jwt-k3y-d0-n0t-sh4re\n' +
      'REDIS_URL=redis://:acmeredis2024@localhost:6379',
      'shell'
    ),
    callout('⚠️', t('Never commit these values. Use 1Password for secret sharing.')),
    h2('Running the App'),
    nl('Clone the repo: '),
    code('git clone https://github.com/acme-labs/platform.git'),
    nl('Install dependencies:'),
    code('npm install'),
    nl('Start services:'),
    code('docker-compose up -d\nnpm run dev'),
  ])

  const deployGuide = await mkpage(eng, 'Deployment Guide', [
    h1('Deploying to Production'),
    p(t('This guide covers our Railway + Vercel deployment pipeline.')),
    h2('Credentials'),
    p(t('Railway token: '), t('railway_token_acme_prod_8f4a2b1c9d3e7f6a5b4c3d2e1f0a9b8c', { code: true })),
    p(t('AWS Access Key ID: '), t('AKIAIOSFODNN7ACMEEXAMPLE', { code: true })),
    p(t('AWS Secret: '), t('wJalrXUtnFEMI/K7MDENG/bPxRfiCYACMEEXAMPLEKEY', { code: true })),
    h2('Steps'),
    nl('Push to main branch'),
    nl('Railway auto-deploys backend'),
    nl('Vercel auto-deploys frontend'),
    nl('Smoke test production URL'),
    p(t('See also: '), m(devSetup)),
  ])

  await mkpage(eng, 'API Documentation', [
    h1('Acme Labs API v2'),
    p(t('Base URL: '), t('https://api.acmelabs.io/v2', { code: true })),
    h2('Authentication'),
    p(t('All requests require a Bearer token in the Authorization header.')),
    h2('Endpoints'),
    h3('Users'),
    li('GET /users — list all users'),
    li('POST /users — create user'),
    li('DELETE /users/:id — soft delete'),
    h3('Projects'),
    li('GET /projects — list projects'),
    li('POST /projects — create project'),
    divider(),
    p(t('Full OpenAPI spec: '), t('https://api.acmelabs.io/v2/docs', { code: true })),
  ])

  await mkpage(eng, 'Architecture Overview', [
    h1('System Architecture'),
    p(t('Acme Labs runs a monorepo with a Next.js frontend and a Node.js API backend.')),
    h2('Services'),
    li('Frontend: Next.js on Vercel'),
    li('API: Express on Railway'),
    li('Database: PostgreSQL (Railway)'),
    li('Cache: Redis (Railway)'),
    li('File storage: S3-compatible (Cloudflare R2)'),
    h2('Key Design Decisions'),
    li('Use repository pattern — no ORM queries in controllers'),
    li('All mutations are event-sourced'),
    li('Feature flags via LaunchDarkly'),
    p(t('Deployment details: '), m(deployGuide)),
  ])

  // Stale / abandoned eng pages
  await mkpage(eng, 'GraphQL Migration Plan', [
    h1('Migrating to GraphQL'),
    p(t('We were exploring a REST → GraphQL migration in Q2 2024. This was deprioritized.')),
    p(t('Status: '), t('ABANDONED', { bold: true })),
  ])

  await mkpage(eng, 'Untitled') // empty
  await mkpage(eng, '') // truly empty title + no blocks

  console.log()

  // ── Product ──────────────────────────────────────────────────────────────────
  console.log('Product...')
  const product = await mkpage(rootId, 'Product')

  const roadmap = await mkpage(product, 'Product Roadmap 2025', [
    h1('Acme Labs — 2025 Roadmap'),
    p(t('This document outlines our key bets for 2025.')),
    h2('Q1'),
    li('Launch v2 API (see '), // will mention eng page
    li('Mobile app beta'),
    li('Enterprise SSO'),
    h2('Q2'),
    li('AI features (autocomplete, summarisation)'),
    li('Marketplace launch'),
    h2('H2'),
    li('International expansion'),
    li('Series B fundraise'),
  ])

  const prds = await mkpage(product, 'PRDs')

  await mkpage(prds, 'PRD: Notifications v2', [
    h1('Product Requirements — Notifications v2'),
    p(t('Owner: Sarah K. | Status: In Review | Target: Q1 2025')),
    h2('Problem'),
    p(t('Users miss important updates because the current notification system only supports email.')),
    h2('Solution'),
    p(t('Add push notifications (web + mobile) and an in-app notification centre.')),
    h2('Success Metrics'),
    li('30% reduction in "missed update" support tickets'),
    li('Notification open rate > 40%'),
    p(t('Roadmap reference: '), m(roadmap)),
  ])

  await mkpage(prds, 'PRD: AI Autocomplete', [
    h1('Product Requirements — AI Autocomplete'),
    p(t('Owner: Tom R. | Status: Draft | Target: Q2 2025')),
    h2('Problem'),
    p(t('Users spend too much time writing repetitive content in the editor.')),
    h2('Solution'),
    p(t('Inline AI suggestions as the user types, powered by GPT-4o.')),
    h2('Open Questions'),
    li('Which model to use for latency vs quality tradeoff?'),
    li('How do we handle PII in user content?'),
  ])

  await mkpage(product, 'Feature Requests', [
    h1('Customer Feature Requests'),
    p(t('Aggregated from Intercom, sales calls, and the community forum.')),
    h2('High Priority'),
    li('Bulk export to CSV'),
    li('Zapier integration'),
    li('Two-factor authentication'),
    h2('Medium Priority'),
    li('Custom domain support'),
    li('Audit logs'),
    h2('Low Priority'),
    li('Dark mode'),
    li('Keyboard shortcuts'),
  ])

  // Orphaned draft — no inbound links, stale
  await mkpage(product, 'Q3 2023 Strategy Doc', [
    p(t('Old strategy doc from Q3 2023. No longer relevant. Should be archived.')),
    li('Expand to APAC — deprioritized'),
    li('Partner with Salesforce — fell through'),
  ])

  await mkpage(product, 'Ideas Dump', [
    p(t('Random ideas, not yet triaged.')),
  ])

  console.log()

  // ── Projects ─────────────────────────────────────────────────────────────────
  console.log('Projects...')
  const projects = await mkpage(rootId, 'Projects')

  // Active project
  const phoenix = await mkpage(projects, 'Project Phoenix')

  const phoenixOverview = await mkpage(phoenix, 'Overview', [
    h1('Project Phoenix'),
    p(t('A complete rewrite of the Acme Labs data pipeline. Target: Q2 2025.')),
    h2('Goals'),
    li('10× throughput improvement'),
    li('Reduce infra cost by 40%'),
    li('Migrate from AWS Lambda to Railway workers'),
    h2('Team'),
    li('Lead: Marcus T.'),
    li('Backend: Elena V., James C.'),
    li('Infra: Priya S.'),
    p(t('Roadmap context: '), m(roadmap)),
    p(t('Eng setup: '), m(devSetup)),
  ])

  await mkpage(phoenix, 'Sprint 4 — Jan 2025', [
    h1('Sprint 4 Planning'),
    p(t('Jan 6 – Jan 17, 2025')),
    h2('Goals'),
    li('Complete ingestion refactor'),
    li('Deploy to staging'),
    li('Load testing'),
    h2('Tickets'),
    li('[PHX-41] Kafka consumer refactor'),
    li('[PHX-42] Staging deployment pipeline'),
    li('[PHX-43] k6 load test suite'),
    p(t('See project overview: '), m(phoenixOverview)),
  ])

  await mkpage(phoenix, 'Sprint 5 — Feb 2025', [
    h1('Sprint 5 Planning'),
    p(t('Feb 3 – Feb 14, 2025')),
    h2('Goals'),
    li('Production cutover'),
    li('Monitoring dashboards'),
    li('Runbook documentation'),
    p(t('Continuing from Sprint 4. Full context: '), m(phoenixOverview)),
  ])

  await mkpage(phoenix, 'Risks & Decisions', [
    h1('Risks'),
    li('Kafka migration may need extra sprint buffer'),
    li('Railway worker pricing unclear at scale'),
    h1('Decisions'),
    li('2025-01-08 — Chose Railway over Fly.io for cost predictability'),
    li('2025-01-15 — Decided to keep existing Postgres schema, migrate ETL only'),
  ])

  // Stale / dead project — no one links to it
  const atlantis = await mkpage(projects, 'Project Atlantis (Archived)')
  await mkpage(atlantis, 'Overview', [
    p(t('Project Atlantis was a mobile-first redesign attempt in 2023. Cancelled after Q2.')),
    p(t('Status: '), t('CANCELLED', { bold: true })),
  ])
  await mkpage(atlantis, 'Design Mockups', [
    p(t('Figma link: https://figma.com/file/oldlink123 (link may be dead)')),
  ])
  await mkpage(atlantis, 'Budget Breakdown', [
    p(t('Q1 2023 budget: $120,000')),
    p(t('Q2 2023 budget: $80,000 (project cancelled mid-quarter)')),
  ])

  // The "soon to be dead link" page
  const tempRef = await mkpage(projects, 'Infrastructure Migration Notes (TEMP)', [
    p(t('Temporary scratch notes for the infra migration. Will be archived once Phoenix ships.')),
    li('Redis upgrade: done'),
    li('Postgres 15 upgrade: in progress'),
    li('Load balancer config: pending'),
  ])

  await mkpage(phoenix, 'Infra Dependencies', [
    p(t('Phoenix depends on: '), m(tempRef)),
    p(t('(Archive "Infrastructure Migration Notes (TEMP)" to test dead link detection)')),
  ])

  console.log()

  // ── Meetings ─────────────────────────────────────────────────────────────────
  console.log('Meetings...')
  const meetings = await mkpage(rootId, 'Meetings')

  // Weekly syncs — several duplicated (common real-world scenario: someone creates the same note twice)
  await mkpage(meetings, 'Weekly Sync — Jan 6, 2025', [
    h1('Weekly Team Sync'),
    p(t('Date: January 6, 2025 | Attendees: Full team')),
    h2('Updates'),
    li('Phoenix Sprint 4 kicked off — Marcus'),
    li('Notifications PRD in review — Sarah'),
    li('New design hire starting Jan 20 — HR'),
    h2('Action Items'),
    li('Marcus: share sprint 4 board by EOD'),
    li('Sarah: incorporate feedback from Tom by Friday'),
    li('All: complete Q4 retrospective survey'),
  ])

  // Duplicate — created again the same day with slightly different title
  await mkpage(meetings, 'Jan 6 Weekly Sync Notes', [
    h1('Weekly Team Sync'),
    p(t('Date: January 6, 2025 | Attendees: Full team')),
    h2('Updates'),
    li('Phoenix Sprint 4 kicked off — Marcus'),
    li('Notifications PRD in review — Sarah'),
    li('New design hire starting Jan 20 — HR'),
    h2('Action Items'),
    li('Marcus: share sprint 4 board by EOD'),
    li('Sarah: incorporate feedback from Tom by Friday'),
    li('All: complete Q4 retrospective survey'),
  ])

  await mkpage(meetings, 'Weekly Sync — Jan 13, 2025', [
    h1('Weekly Team Sync'),
    p(t('Date: January 13, 2025 | Attendees: Full team')),
    h2('Updates'),
    li('Phoenix ingestion refactor 60% done'),
    li('Notifications PRD approved — moving to eng handoff'),
    li('Design interview scheduled for Jan 21'),
    h2('Action Items'),
    li('Elena: unblock PHX-41 by Wednesday'),
    li('Tom: create eng ticket for notifications'),
  ])

  await mkpage(meetings, 'Q1 2025 Planning', [
    h1('Q1 2025 Planning Session'),
    p(t('Date: January 3, 2025 | Full team offsite')),
    h2('Themes'),
    li('Ship Phoenix by end of Q1'),
    li('Grow enterprise pipeline'),
    li('Hire 2 engineers, 1 designer'),
    p(t('Roadmap: '), m(roadmap)),
    p(t('Phoenix project: '), m(phoenixOverview)),
  ])

  // Duplicate planning doc
  await mkpage(meetings, 'Q1 Planning Notes 2025', [
    h1('Q1 2025 Planning Session'),
    p(t('Date: January 3, 2025 | Full team offsite')),
    h2('Themes'),
    li('Ship Phoenix by end of Q1'),
    li('Grow enterprise pipeline'),
    li('Hire 2 engineers, 1 designer'),
    p(t('Roadmap: '), m(roadmap)),
  ])

  await mkpage(meetings, '1:1 Marcus — Jan 2025', [
    h1('1:1 Notes — Marcus T.'),
    h2('Jan 8'),
    li('Feeling good about Phoenix timeline'),
    li('Wants to explore staff eng track — schedule review with HR'),
    h2('Jan 22'),
    li('Concerned about Priya\'s bandwidth'),
    li('Requested budget for k6 enterprise license'),
  ])

  // Empty meeting notes (placeholder never filled)
  await mkpage(meetings, 'Weekly Sync — Jan 20, 2025') // empty
  await mkpage(meetings, 'Board Meeting — Q4 2024') // empty

  console.log()

  // ── HR & People ───────────────────────────────────────────────────────────────
  console.log('HR & People...')
  const hr = await mkpage(rootId, 'HR & People')

  await mkpage(hr, 'Employee Directory', [
    h1('Team Directory'),
    h2('Engineering'),
    li('Marcus T. — marcus@acmelabs.io — +1 (415) 555-0192 — SSN: 078-05-1120'),
    li('Elena V. — elena@acmelabs.io — +1 (415) 555-0134'),
    li('James C. — james@acmelabs.io — +1 (415) 555-0187 — DOB: 1990-07-23'),
    li('Priya S. — priya@acmelabs.io — +1 (415) 555-0156'),
    h2('Product'),
    li('Sarah K. — sarah@acmelabs.io'),
    li('Tom R. — tom@acmelabs.io'),
    h2('Operations'),
    li('Linda W. — linda@acmelabs.io — Emergency contact: husband John +1 (415) 555-0199'),
  ])

  await mkpage(hr, 'Onboarding Checklist', [
    h1('New Employee Onboarding'),
    nl('Send welcome email from linda@acmelabs.io'),
    nl('Create accounts: GitHub, Notion, Linear, Slack, AWS'),
    nl('Provision laptop via IT (contact james@acmelabs.io)'),
    nl('Add to payroll (ADP login: acmelabs / P@yroll#2024)'),
    nl('Schedule 1:1s with team leads in week 1'),
    nl('Share dev setup guide'),
    p(t('See: '), m(devSetup)),
    p(t('')),
    h2('Offboarding'),
    nl('Revoke all access within 24 hours of last day'),
    nl('Transfer Notion ownership'),
    nl('Final payslip via ADP'),
  ])

  await mkpage(hr, 'Compensation Bands 2025', [
    h1('Compensation Bands — Confidential'),
    callout('🔒', t('Do not share outside of exec team and HR.')),
    h2('Engineering'),
    li('L1 (Junior): $90k – $110k'),
    li('L2 (Mid): $120k – $145k'),
    li('L3 (Senior): $155k – $185k'),
    li('L4 (Staff): $190k – $230k'),
    h2('Product'),
    li('PM I: $110k – $130k'),
    li('PM II: $135k – $160k'),
    li('Senior PM: $165k – $195k'),
  ])

  // Old abandoned HR page
  await mkpage(hr, 'Team Offsites 2022', [
    p(t('Notes from the 2022 team offsite in Tahoe. Kept for reference.')),
    li('June 12–14, 2022'),
    li('Budget: $15,000'),
    li('Attendees: 12'),
  ])

  console.log()

  // ── Company ──────────────────────────────────────────────────────────────────
  console.log('🏛️  Company...')
  const company = await mkpage(rootId, 'Company')

  await mkpage(company, 'Mission & Values', [
    h1('Mission'),
    p(t('Help teams ship faster by removing the friction between ideas and execution.')),
    h1('Values'),
    li('Speed over perfection — iterate fast, learn faster'),
    li('Radical transparency — default to open'),
    li('User obsession — every decision starts with the customer'),
    li('High trust, high accountability'),
  ])

  await mkpage(company, 'Investor Updates', [
    h1('Investor Updates'),
    h2('Q4 2024'),
    p(t('ARR: $2.4M (+18% QoQ) | Runway: 18 months | Headcount: 14')),
    h2('Q3 2024'),
    p(t('ARR: $2.0M (+22% QoQ) | Runway: 20 months | Headcount: 12')),
  ])

  await mkpage(company, 'Legal & Compliance', [
    h1('Legal'),
    li('Incorporated: Delaware C-Corp, 2022'),
    li('Legal counsel: Gunderson Dettmer'),
    li('IP agreement: all employees on PIIA'),
    h2('Passwords & Access'),
    p(t('DocuSign admin: admin@acmelabs.io / Acme!DocuSign2024')),
    p(t('Delaware registered agent login: acmelabs / R3gAgt#Corp')),
  ])

  // Orphaned scratch page — no links, never updated
  await mkpage(company, 'Scratch', [])
  await mkpage(rootId, 'Untitled') // top-level orphan
  await mkpage(rootId, '') // empty title orphan

  console.log()

  // ── Final summary ────────────────────────────────────────────────────────────
  console.log('✅ Done!\n')
  console.log('What was seeded:')
  console.log('  ⚙️  Engineering     — dev setup (API keys + DB passwords), deployment (AWS keys), architecture, API docs, stale GraphQL plan, 2 empty pages')
  console.log('  Product         — roadmap, PRDs, feature requests, stale Q3 2023 strategy, abandoned ideas dump')
  console.log('  Projects        — active Phoenix (linked pages), dead Atlantis, temp infra page (archive it to test dead links)')
  console.log('  Meetings        — 2 sets of duplicate notes (Jan 6 sync, Q1 planning), 2 empty meeting pages')
  console.log('  HR & People     — employee directory (PII: SSN, phone, DOB), onboarding (ADP password), compensation bands, stale 2022 offsite')
  console.log('  🏛️  Company         — mission, investor updates, legal (DocuSign password), 2 empty/orphan pages')
  console.log()
  console.log(` Root page ID: ${rootId}`)
  console.log('   Delete "Acme Labs" in Notion to remove everything.')
  console.log()
  console.log('🔗 Dead link test: archive "Infrastructure Migration Notes (TEMP)" in Projects')
}

main().catch(err => {
  console.error('\n❌ Seeder failed:', err?.message ?? err)
  process.exit(1)
})

