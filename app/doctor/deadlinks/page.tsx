'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ScanSearch,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2Off,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { InfoLinks } from '@/components/Landing/InfoLinks'
import { CyberLoader } from '@/components/CyberLoader'
import type { DeadLink, DeadLinkScanResult } from '@/lib/notion/NotionClient'

// Group dead links by source page for a cleaner UI
function groupBySource(deadLinks: DeadLink[]): Map<string, DeadLink[]> {
  const map = new Map<string, DeadLink[]>()
  for (const dl of deadLinks) {
    const existing = map.get(dl.sourcePageId) ?? []
    existing.push(dl)
    map.set(dl.sourcePageId, existing)
  }
  return map
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ sourcePageId, sourcePageTitle, links }: {
  sourcePageId: string
  sourcePageTitle: string
  links: DeadLink[]
}) {
  return (
    <div className="glass-card rounded-xl border border-red-400/20 overflow-hidden">
      {/* Source page header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Link2Off size={13} className="text-red-400 shrink-0" />
          <span className="text-sm font-semibold truncate">
            {sourcePageTitle || <span className="italic text-muted-foreground">(untitled)</span>}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
            {links.length} dead link{links.length !== 1 ? 's' : ''}
          </span>
          <a
            href={`https://notion.so/${sourcePageId.replace(/-/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[#00d4ff] transition-colors"
          >
            <ExternalLink size={10} /> Open
          </a>
        </div>
      </div>

      {/* Broken links list */}
      <div className="divide-y divide-white/5">
        {links.map((dl) => (
          <div key={dl.brokenTargetId} className="flex items-center gap-3 px-4 py-3">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0" />
            <span className="text-xs font-mono text-muted-foreground truncate">
              Missing:{' '}
              <span className="text-red-400/80">
                {dl.brokenTargetTitle ?? dl.brokenTargetId}
              </span>
              {!dl.brokenTargetTitle && (
                <span className="text-muted-foreground/40 ml-1">(deleted)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeadLinksPage() {
  const [result, setResult] = useState<DeadLinkScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runScan = async () => {
    setScanning(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/deadlinks')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Scan failed.')
        return
      }
      setResult(data)
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setScanning(false)
    }
  }

  const grouped = result ? groupBySource(result.deadLinks) : new Map<string, DeadLink[]>()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        rightSlot={
          <div className="flex items-center gap-3">
            <InfoLinks />
            <Link href="/dashboard" className="neon-btn-ghost text-sm w-32 text-center py-3">Dashboard</Link>
          </div>
        }
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm font-medium text-[#00d4ff]/70 hover:text-[#00d4ff] transition-colors w-fit mb-3"
          >
            <ArrowLeft size={15} /> Dashboard
          </Link>
          <h1
            className="text-2xl font-bold neon-text"
            style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}
          >
            Dead Link Detector
          </h1>
          <p className="text-muted-foreground text-sm">
            Scans each page&apos;s top-level content for <span className="text-foreground">@mentions</span> pointing to pages that no longer exist in your workspace.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="glass-card rounded-xl p-5 border border-red-400/30 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Scan button + summary */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={runScan}
            disabled={scanning}
            className="neon-btn px-6 py-2.5 flex items-center gap-2 disabled:opacity-40"
          >
            {scanning ? (
              <><span className="animate-spin text-sm">⠋</span> Scanning…</>
            ) : (
              <><ScanSearch size={14} /> {result ? 'Rescan' : 'Scan Workspace'}</>
            )}
          </button>

          {result && !scanning && (
            <span className="text-xs font-mono text-muted-foreground">
              {result.stats.deadLinkCount === 0
                ? '✦ No dead links found'
                : `✦ ${result.stats.deadLinkCount} dead link${result.stats.deadLinkCount !== 1 ? 's' : ''} across ${grouped.size} page${grouped.size !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Stats row */}
        {result && !scanning && (
          <div className="flex flex-wrap gap-3">
            <div className="glass-card rounded-lg px-4 py-2 border border-red-400/20 flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-red-400">{result.stats.deadLinkCount}</span>
              <span className="text-xs text-muted-foreground">dead links</span>
            </div>
            <div className="glass-card rounded-lg px-4 py-2 border border-white/5 flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-muted-foreground">{result.stats.scannedPages}</span>
              <span className="text-xs text-muted-foreground">pages scanned</span>
            </div>
            {result.stats.archiveExcluded > 0 && (
              <div className="glass-card rounded-lg px-4 py-2 border border-white/5 flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-muted-foreground">{result.stats.archiveExcluded}</span>
                <span className="text-xs text-muted-foreground">archive excluded</span>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {scanning && (
          <div className="glass-card rounded-xl p-10 border border-white/5 flex flex-col items-center gap-4">
            <CyberLoader />
            <p className="text-xs font-mono text-muted-foreground">Scanning blocks for broken @mentions…</p>
          </div>
        )}

        {/* Results */}
        {result && !scanning && grouped.size > 0 && (
          <div className="flex flex-col gap-4">
            {[...grouped.entries()].map(([sourcePageId, links]) => (
              <SourceCard
                key={sourcePageId}
                sourcePageId={sourcePageId}
                sourcePageTitle={links[0].sourcePageTitle}
                links={links}
              />
            ))}
          </div>
        )}

        {/* All clean */}
        {result && result.stats.deadLinkCount === 0 && !scanning && (
          <div className="glass-card rounded-xl p-8 border border-emerald-400/30 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="font-semibold text-emerald-400">No dead links found</p>
            <p className="text-sm text-muted-foreground">
              All @mentions across {result.stats.scannedPages} scanned pages point to existing pages.
            </p>
          </div>
        )}

      </main>
    </div>
  )
}
