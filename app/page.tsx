'use client'

import { useEffect, useState } from 'react'
import { NetworkBackground } from '@/components/Landing/NetworkBackground'
import { TerminalDemo } from '@/components/Landing/TerminalDemo'
import { FeatureCard } from '@/components/Landing/FeatureCard'
import { Navbar } from '@/components/Navbar'
import { LayoutDashboard, GitMerge, Trash2, Network, Sparkles, Link2Off, ShieldAlert } from 'lucide-react'
import Link from 'next/link'

const FEATURES = [
  {
    icon: <LayoutDashboard size={24} />,
    title: 'Workspace Health',
    description: 'Instant overview of your workspace: total pages, orphans, duplicate candidates, and link density score.',
    tag: 'dashboard',
  },
  {
    icon: <GitMerge size={24} />,
    title: 'Duplicate Detection',
    description: 'AI semantically identifies near-duplicate notes. Side-by-side diff, similarity score, confirm before merging.',
    tag: 'AI',
  },
  {
    icon: <Trash2 size={24} />,
    title: 'Garbage Collector',
    description: 'Finds empty, orphaned, and stale pages. Dry-run mode shows exactly what would be removed before you commit.',
    tag: 'AI',
  },
  {
    icon: <Network size={24} />,
    title: 'Dependency Graph',
    description: 'Interactive React Flow graph of all linked notes and tasks. Click any node to preview the page.',
    tag: 'visual',
  },
  {
    icon: <Link2Off size={24} />,
    title: 'Dead Link Detector',
    description: 'Scans every page for @mentions pointing to archived or deleted pages so nothing quietly breaks.',
    tag: 'scan',
  },
  {
    icon: <ShieldAlert size={24} />,
    title: 'Sensitive Data Finder',
    description: 'Detects accidentally stored API keys, tokens, passwords, and PII before they become a security incident.',
    tag: 'scan',
  },
  {
    icon: <Sparkles size={24} />,
    title: 'Semantic Ask',
    description: 'Free-form natural language instructions. AI decomposes them into actions and awaits your approval.',
    tag: 'AI · MCP',
  },
]

const PROVIDERS = ['OpenAI', 'Anthropic', 'xAI', 'Google Gemini']

export default function Home() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/notion/status')
      .then((r) => r.json())
      .then((data) => { if (data.connected) setConnected(true) })
      .catch(() => {})
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <NetworkBackground />

      <Navbar rightSlot={
        <div className="flex items-center gap-4">
          {connected
            ? <Link href="/dashboard" className="neon-btn px-8 py-3 text-sm">Go to Dashboard →</Link>
            : <Link href="/settings" className="neon-btn px-8 py-3 text-sm">Connect Notion →</Link>
          }
        </div>
      } />

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-16 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-[#00d4ff]/20 bg-[#00d4ff]/5 text-xs font-mono text-[#00d4ff]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
          Powered by Notion MCP · OpenAI · Anthropic · xAI · Google
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          Your Notion Workspace,{' '}
          <span className="neon-text">Intelligently Managed</span>
        </h1>

        <p className="text-muted-foreground text-lg max-w-2xl mb-10 leading-relaxed">
          Your workspace. Analyzed. Cleaned. Understood. <span className="neon-text">NoteRunway</span> connects AI to your Notion via MCP — and never moves a single page without your say-so.
        </p>

        <TerminalDemo />

        <div className="flex flex-col sm:flex-row gap-4 mt-10">
          <Link
            href={connected ? '/dashboard' : '/settings'}
            className="neon-btn px-8 py-3"
          >
            {connected ? 'Go to Dashboard →' : "Connect Notion — it's free"}
          </Link>
          <a
            href="https://github.com/georgekobaidze/noterunway"
            target="_blank"
            rel="noopener noreferrer"
            className="neon-btn-ghost px-8 py-3"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-center text-2xl font-bold mb-2">Everything your workspace needs</h2>
        <p className="text-center text-muted-foreground mb-10 text-sm">Seven tools. One interface. Zero lock-in.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.filter(f => f.title !== 'Semantic Ask').map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
        {/* Semantic Ask — full-width featured card */}
        {FEATURES.filter(f => f.title === 'Semantic Ask').map((f) => (
          <div key={f.title} className="mt-5">
            <FeatureCard {...f} featured />
          </div>
        ))}
      </section>

      {/* Provider strip */}
      <section className="relative z-10 px-6 py-10 max-w-6xl mx-auto border-t border-white/5">
        <p className="text-center text-xs font-mono text-muted-foreground tracking-widest uppercase mb-6">
          Bring your own key — works with
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {PROVIDERS.map((p) => (
            <span key={p} className="text-muted-foreground/60 font-mono text-sm hover:text-[#00d4ff] transition-colors">
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-xs text-muted-foreground/40 font-mono">
        Built for the{' '}
        <a href="https://dev.to/challenges/notion-2026-03-04" className="hover:text-[#00d4ff] transition-colors">
          DEV × Notion MCP Challenge
        </a>
      </footer>
    </div>
  )
}

