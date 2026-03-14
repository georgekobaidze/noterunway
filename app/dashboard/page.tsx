'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { LayoutDashboard, GitMerge, Trash2, Network, Database, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react'
import type { WorkspaceStats } from '@/lib/notion/NotionClient'

interface StatCardProps {
  label: string
  value: number | string
  sub?: string
  accent?: 'blue' | 'purple' | 'amber' | 'emerald' | 'red'
  loading?: boolean
}

function StatCard({ label, value, sub, accent = 'blue', loading }: StatCardProps) {
  const colors = {
    blue:    'text-[#00d4ff] border-[#00d4ff]/30',
    purple:  'text-[#7b2fff] border-[#7b2fff]/30',
    amber:   'text-amber-400 border-amber-400/30',
    emerald: 'text-emerald-400 border-emerald-400/30',
    red:     'text-red-400 border-red-400/30',
  }

  return (
    <div className={`glass-card rounded-xl p-6 border ${colors[accent]} flex flex-col gap-2`}>
      <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {loading ? (
        <div className="h-9 w-20 rounded bg-white/5 animate-pulse" />
      ) : (
        <span className={`text-4xl font-bold font-mono ${colors[accent].split(' ')[0]}`}>{value}</span>
      )}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

interface FeatureLinkProps {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  tag: string
}

function FeatureLink({ href, icon, title, description, tag }: FeatureLinkProps) {
  return (
    <Link
      href={href}
      className="glass-card rounded-xl p-5 border border-white/5 hover:border-[#00d4ff]/40 transition-all group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div className="text-[#00d4ff] group-hover:scale-110 transition-transform">{icon}</div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#00d4ff]/20 text-[#00d4ff]/60 tracking-widest uppercase">
          {tag}
        </span>
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground group-hover:text-[#00d4ff] transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workspace/stats')
      if (res.status === 401) {
        setError('not_connected')
        return
      }
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to load stats')
        return
      }
      setStats(await res.json())
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
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
        <Link href="/settings" className="neon-btn-ghost px-5 py-2 text-xs">Settings</Link>
      } />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 flex flex-col gap-10">

        {/* Header */}
        <div className="flex items-start justify-between">
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
          <button
            onClick={fetchStats}
            disabled={loading}
            className="neon-btn-ghost px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Not connected state */}
        {error === 'not_connected' && (
          <div className="glass-card rounded-xl p-8 border border-amber-400/30 flex flex-col items-center gap-4 text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <div>
              <p className="font-semibold text-amber-400">Notion not connected</p>
              <p className="text-sm text-muted-foreground mt-1">Connect your workspace to see health stats.</p>
            </div>
            <Link href="/settings" className="neon-btn px-6 py-2.5 text-sm">
              Go to Settings →
            </Link>
          </div>
        )}

        {/* Generic error */}
        {error && error !== 'not_connected' && (
          <div className="glass-card rounded-xl p-6 border border-red-400/30 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Stats grid */}
        {!error && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              label="Total Pages"
              value={stats?.totalPages ?? 0}
              sub="in your workspace"
              accent="blue"
              loading={loading}
            />
            <StatCard
              label="Orphan Pages"
              value={stats?.orphanPages ?? 0}
              sub="no inbound links"
              accent={stats && stats.orphanPages > 10 ? 'amber' : 'emerald'}
              loading={loading}
            />
            <StatCard
              label="Empty Pages"
              value={stats?.emptyPages ?? 0}
              sub="no title"
              accent={stats && stats.emptyPages > 5 ? 'amber' : 'emerald'}
              loading={loading}
            />
            <StatCard
              label="Duplicate Candidates"
              value={stats?.duplicateCandidates ?? 0}
              sub="matching titles"
              accent={stats && stats.duplicateCandidates > 0 ? 'purple' : 'emerald'}
              loading={loading}
            />
            <StatCard
              label="Recently Edited"
              value={stats?.recentlyEditedPages ?? 0}
              sub="in the last 7 days"
              accent="blue"
              loading={loading}
            />
            <StatCard
              label="Link Density"
              value={loading ? '—' : `${Math.round((stats?.linkDensity ?? 0) * 100)}%`}
              sub="pages with inbound links"
              accent={stats && stats.linkDensity > 0.5 ? 'emerald' : 'amber'}
              loading={loading}
            />
          </div>
        )}

        {/* Feature tools */}
        {!error && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4"
              style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
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
                tag="AI"
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
          </div>
        )}

      </main>
    </div>
  )
}
