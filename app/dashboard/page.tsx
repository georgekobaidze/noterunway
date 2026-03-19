'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { CyberLoader } from '@/components/CyberLoader'
import { GitMerge, Trash2, Network, Database, Sparkles, AlertTriangle, RefreshCw, ScanSearch, Link2Off, ShieldAlert } from 'lucide-react'
import type { WorkspaceStats } from '@/lib/notion/NotionClient'

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string | null
  sub?: string
  accent?: 'blue' | 'purple' | 'amber' | 'emerald' | 'red'
  loading?: boolean
  onScan?: () => void
  scanLabel?: string
}

function StatCard({ label, value, sub, accent = 'blue', loading, onScan, scanLabel = 'Scan' }: StatCardProps) {
  const colors = {
    blue:    { border: 'border-[#00d4ff]/30', text: 'text-[#00d4ff]' },
    purple:  { border: 'border-[#7b2fff]/30', text: 'text-[#7b2fff]' },
    amber:   { border: 'border-amber-400/30',  text: 'text-amber-400' },
    emerald: { border: 'border-emerald-400/30', text: 'text-emerald-400' },
    red:     { border: 'border-red-400/30',    text: 'text-red-400' },
  }
  const { border, text } = colors[accent]

  return (
    <div className={`glass-card rounded-xl p-6 border ${border} flex flex-col gap-2`}>
      <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {loading ? (
        <CyberLoader />
      ) : value !== null ? (
        <span className={`text-4xl font-bold font-mono ${text}`}>{value}</span>
      ) : (
        onScan && (
          <button
            onClick={onScan}
            className={`mt-1 flex items-center gap-1.5 text-[11px] font-mono ${text} opacity-60 hover:opacity-100 transition-opacity`}
          >
            <ScanSearch size={12} />
            {scanLabel}
          </button>
        )
      )}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

// ─── Feature Link ─────────────────────────────────────────────────────────────

interface FeatureLinkProps {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  tag?: string
}

function FeatureLink({ href, icon, title, description, tag }: FeatureLinkProps) {
  return (
    <Link
      href={href}
      className="glass-card rounded-xl p-5 border border-white/5 hover:border-[#00d4ff]/40 transition-all group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className="text-[#00d4ff] group-hover:scale-110 transition-transform">{icon}</div>
        {tag && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#00d4ff]/20 text-[#00d4ff]/60 tracking-widest uppercase">
          {tag}
        </span>}
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground group-hover:text-[#00d4ff] transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [emptyPages, setEmptyPages] = useState<number | null>(null)
  const [emptyLoading, setEmptyLoading] = useState(false)
  
  const [linkDensity, setLinkDensity] = useState<number | null>(null)
  const [linkDensityLoading, setLinkDensityLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setStatsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workspace/stats')
      if (res.status === 401) { setError('not_connected'); return }
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to load stats')
        return
      }
      setStats(await res.json())
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setStatsLoading(false)
    }
  }

  const scanLinkDensity = async () => {
    setLinkDensityLoading(true)
    try {
      const res = await fetch('/api/workspace/link-density')
      if (res.ok) setLinkDensity((await res.json()).density)
    } finally {
      setLinkDensityLoading(false)
    }
  }

  const scanEmptyPages = async () => {
    setEmptyLoading(true)
    try {
      const res = await fetch('/api/workspace/empty-pages')
      if (res.ok) setEmptyPages((await res.json()).count)
    } finally {
      setEmptyLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  const workspaceName = (() => {
    try {
      const match = document.cookie.match(/notion_workspace=([^;]+)/)
      if (match) return JSON.parse(decodeURIComponent(match[1]))?.name ?? null
    } catch {}
    return null
  })()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar rightSlot={
        <Link href="/settings" className="neon-btn-ghost px-8 py-3 text-sm">Settings</Link>
      } />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 flex flex-col gap-10">

        {/* Header */}
        <div>
          <h1
            className="text-2xl font-bold neon-text"
            style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}
          >
            Workspace Health
          </h1>
          {workspaceName && (
            <p className="text-muted-foreground text-sm mt-1">{workspaceName}</p>
          )}
        </div>

        {/* Not connected */}
        {error === 'not_connected' && (
          <div className="glass-card rounded-xl p-8 border border-amber-400/30 flex flex-col items-center gap-4 text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <div>
              <p className="font-semibold text-amber-400">Notion not connected</p>
              <p className="text-sm text-muted-foreground mt-1">Connect your workspace to see health stats.</p>
            </div>
            <Link href="/settings" className="neon-btn px-6 py-2.5 text-sm">Go to Settings →</Link>
          </div>
        )}

        {/* Generic error */}
        {error && error !== 'not_connected' && (
          <div className="glass-card rounded-xl p-6 border border-red-400/30 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!error && (<>

          {/* Quick Stats */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}
              >
                Quick Stats
              </h2>
              <button
                onClick={fetchStats}
                disabled={statsLoading}
                className="neon-btn-ghost px-3 py-1.5 text-[11px] flex items-center gap-1.5 disabled:opacity-40"
              >
                <RefreshCw size={11} className={statsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard
                label="Total Pages"
                value={stats?.totalPages ?? null}
                sub="in your workspace"
                accent="blue"
                loading={statsLoading}
              />
              <StatCard
                label="Top-level Pages"
                value={stats?.topLevelPages ?? null}
                sub="no parent page"
                accent="blue"
                loading={statsLoading}
              />
              <StatCard
                label="Recently Edited"
                value={stats?.recentlyEditedPages ?? null}
                sub="in the last 7 days"
                accent="blue"
                loading={statsLoading}
              />
            </div>
          </section>

          {/* Deep Scans */}
          <section className="flex flex-col gap-3">
            <h2
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}
            >
              Deep Scans
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard
                label="Empty Pages"
                value={emptyPages}
                sub={emptyPages !== null ? 'no content blocks' : 'checks every page individually'}
                accent={emptyPages !== null && emptyPages > 5 ? 'amber' : 'blue'}
                loading={emptyLoading}
                onScan={scanEmptyPages}
                scanLabel={emptyPages !== null ? 'Rescan' : 'Scan'}
              />
              <StatCard
                label="Link Density"
                value={linkDensity !== null ? `${Math.round(linkDensity * 100)}%` : null}
                sub={linkDensity !== null ? 'pages mentioned by other pages' : 'scans all page content for @mentions'}
                accent={linkDensity !== null && linkDensity > 0.5 ? 'emerald' : 'blue'}
                loading={linkDensityLoading}
                onScan={scanLinkDensity}
                scanLabel={linkDensity !== null ? 'Rescan' : 'Scan'}
              />
            </div>
          </section>

          {/* Feature tools */}
          <section className="flex flex-col gap-3">
            <h2
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}
            >
              Tools
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureLink
                href="/doctor/duplicates"
                icon={<GitMerge size={20} />}
                title="Duplicate Detection"
                description="Find and merge semantically similar pages with AI."
                tag="AI"
              />
              <FeatureLink
                href="/doctor/garbage"
                icon={<Trash2 size={20} />}
                title="Garbage Collector"
                description="Archive empty, orphaned, and stale pages safely."
              />
              <FeatureLink
                href="/doctor/deadlinks"
                icon={<Link2Off size={20} />}
                title="Dead Link Detector"
                description="Find @mentions pointing to deleted or missing pages."
              />
              <FeatureLink
                href="/doctor/sensitive"
                icon={<ShieldAlert size={20} />}
                title="Sensitive Data Finder"
                description="Scan every page for accidentally stored API keys, tokens, and credentials."
              />
              <FeatureLink
                href="/graph"
                icon={<Network size={20} />}
                title="Dependency Graph"
                description="Interactive graph of all linked notes and tasks."
                tag="visual"
              />
              <FeatureLink
                href="/query"
                icon={<Database size={20} />}
                title="SQL Query"
                description="Query your workspace with SQL-like syntax."
                tag="query"
              />
              <FeatureLink
                href="/ask"
                icon={<Sparkles size={20} />}
                title="Semantic Ask"
                description="Give a natural language instruction — AI handles the rest."
                tag="AI · MCP"
              />
            </div>
          </section>

        </>)}

      </main>
    </div>
  )
}

