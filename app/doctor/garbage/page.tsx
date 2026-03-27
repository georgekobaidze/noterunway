'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Trash2,
  ScanSearch,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Clock,
  Unlink,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CyberLoader } from '@/components/CyberLoader'
import type { GarbagePage, GarbageScanResult } from '@/lib/notion/NotionClient'

// ─── Config ───────────────────────────────────────────────────────────────────

const STALE_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
]

const CATEGORY_META = {
  orphaned: {
    label: 'Orphaned',
    Icon: Unlink,
    color: 'text-red-400',
    border: 'border-red-400/20',
    badge: 'text-red-400 bg-red-400/10',
    desc: 'Parent page was deleted or moved outside integration scope',
  },
  empty: {
    label: 'Empty',
    Icon: Inbox,
    color: 'text-amber-400',
    border: 'border-amber-400/20',
    badge: 'text-amber-400 bg-amber-400/10',
    desc: 'Page has no content blocks',
  },
  stale: {
    label: 'Stale',
    Icon: Clock,
    color: 'text-[#7b2fff]',
    border: 'border-[#7b2fff]/20',
    badge: 'text-[#7b2fff] bg-[#7b2fff]/10',
    desc: 'Page has not been edited within the selected timeframe',
  },
}

// ─── Page Row ─────────────────────────────────────────────────────────────────

function PageRow({
  page,
  selected,
  archived,
  onToggle,
}: {
  page: GarbagePage
  selected: boolean
  archived: boolean
  onToggle: (id: string) => void
}) {
  const daysAgo = Math.floor(
    (Date.now() - new Date(page.lastEdited).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (archived) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 opacity-50">
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        <span className="text-sm text-emerald-400 font-mono line-through truncate">
          {page.title || '(untitled)'}
        </span>
      </div>
    )
  }

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={() => onToggle(page.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(page.id)
        }
      }}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        selected ? 'bg-red-400/5' : 'hover:bg-white/[0.02]'
      }`}
    >
      {/* Checkbox */}
      <div
        className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          selected ? 'border-red-400 bg-red-400/20' : 'border-white/20'
        }`}
      >
        {selected && <div className="w-2 h-2 rounded-sm bg-red-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <span className={`text-sm leading-snug truncate block ${selected ? 'text-red-300' : 'text-foreground'}`}>
          {page.title || <span className="italic text-muted-foreground">(untitled)</span>}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">
          {daysAgo === 0 ? 'edited today' : `edited ${daysAgo}d ago`}
        </span>
      </div>

      <a
        href={`https://notion.so/${page.id.replace(/-/g, '')}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[#00d4ff] transition-colors flex-shrink-0"
        aria-label={page.title ? `Open "${page.title}" in Notion` : 'Open page in Notion'}
      >
        <ExternalLink size={10} />
      </a>
    </div>
  )
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  pages,
  selected,
  archived,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  category: 'empty' | 'stale' | 'orphaned'
  pages: GarbagePage[]
  selected: Set<string>
  archived: Set<string>
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onDeselectAll: (ids: string[]) => void
}) {
  const meta = CATEGORY_META[category]
  const { Icon } = meta
  const activeIds = pages.filter((p) => !archived.has(p.id)).map((p) => p.id)
  const allSelected = activeIds.length > 0 && activeIds.every((id) => selected.has(id))

  if (pages.length === 0) return null

  return (
    <div className={`glass-card rounded-xl border ${meta.border} overflow-hidden`}>
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Icon size={14} className={meta.color} />
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${meta.badge}`}>
            {pages.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground hidden sm:block">{meta.desc}</span>
          <button
            onClick={() => allSelected ? onDeselectAll(activeIds) : onSelectAll(activeIds)}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      </div>

      {/* Page list */}
      <div className="divide-y divide-white/5">
        {pages.map((page) => (
          <PageRow
            key={page.id}
            page={page}
            selected={selected.has(page.id)}
            archived={archived.has(page.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GarbagePage() {
  const [staleDays, setStaleDays] = useState(90)
  const [result, setResult] = useState<GarbageScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [archiving, setArchiving] = useState(false)

  const runScan = async () => {
    setScanning(true)
    setError(null)
    setResult(null)
    setSelected(new Set())
    setArchived(new Set())

    try {
      const res = await fetch(`/api/garbage?staleDays=${staleDays}`)
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

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelectAll = (ids: string[]) => {
    setSelected((prev) => new Set([...prev, ...ids]))
  }

  const handleDeselectAll = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const handleArchive = async () => {
    if (selected.size === 0 || !result) return
    setArchiving(true)
    setError(null)

    const allPages = [...result.orphaned, ...result.empty, ...result.stale]
    const pages = allPages
      .filter((p) => selected.has(p.id))
      .map((p) => ({ id: p.id, title: p.title }))

    try {
      const res = await fetch('/api/garbage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages, reason: 'Identified as garbage by Garbage Collector' }),
      })
      const data = await res.json()
      if (res.ok) {
        const archivedIds: string[] = data.archivedIds ?? []
        setArchived((prev) => new Set([...prev, ...archivedIds]))
        setSelected(new Set())
        if ((data.failedIds ?? []).length > 0) {
          setError(`${data.failedIds.length} page(s) could not be archived.`)
        }
      } else {
        setError(data.error ?? 'Archive failed.')
      }
    } catch {
      setError('Network error — could not archive pages.')
    } finally {
      setArchiving(false)
    }
  }

  const totalFound = result ? result.orphaned.length + result.empty.length + result.stale.length : 0
  const totalActive = result
    ? [...result.orphaned, ...result.empty, ...result.stale].filter((p) => !archived.has(p.id)).length
    : 0

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        rightSlot={
          <Link href="/dashboard" className="neon-btn-ghost text-sm w-32 text-center py-3">Dashboard</Link>
        }
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#00d4ff] transition-colors w-fit mb-2"
          >
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <h1
            className="text-2xl font-bold neon-text"
            style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}
          >
            Garbage Collector
          </h1>
          <p className="text-muted-foreground text-sm">
            Find and archive orphaned, empty, and stale pages. Review the list before archiving — nothing is deleted permanently.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="glass-card rounded-xl p-5 border border-red-400/30 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={runScan}
            disabled={scanning}
            className="neon-btn px-6 py-2.5 flex items-center gap-2 disabled:opacity-40"
          >
            {scanning ? (
              <>
                <span className="animate-spin text-sm">⠋</span> Scanning…
              </>
            ) : (
              <>
                <ScanSearch size={14} /> {result ? 'Rescan' : 'Scan Workspace'}
              </>
            )}
          </button>

          {/* Stale threshold selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Stale after</span>
            <select
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value))}
              disabled={scanning}
              className="bg-background border border-white/10 rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-[#00d4ff]/40 disabled:opacity-40"
            >
              {STALE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scan summary */}
          {result && !scanning && (
            <span className="text-xs font-mono text-muted-foreground">
              {totalFound === 0
                ? '✦ Workspace is clean'
                : `✦ ${totalFound} page${totalFound !== 1 ? 's' : ''} flagged · ${archived.size} archived`}
            </span>
          )}
        </div>

        {/* Stats row */}
        {result && !scanning && (
          <div className="flex flex-wrap gap-3">
            {(
              [
                { label: 'Orphaned', count: result.orphaned.length, color: 'text-red-400 border-red-400/20' },
                { label: 'Empty', count: result.empty.length, color: 'text-amber-400 border-amber-400/20' },
                { label: 'Stale', count: result.stale.length, color: 'text-[#7b2fff] border-[#7b2fff]/20' },
              ] as const
            ).map(({ label, count, color }) => (
              <div key={label} className={`glass-card rounded-lg px-4 py-2 border ${color.split(' ')[1]} flex items-center gap-2`}>
                <span className={`text-lg font-bold font-mono ${color.split(' ')[0]}`}>{count}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
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
            <p className="text-xs font-mono text-muted-foreground">Scanning workspace for garbage pages…</p>
          </div>
        )}

        {/* Archive action bar */}
        {selected.size > 0 && !scanning && (
          <div className="glass-card rounded-xl p-4 border border-red-400/20 flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              <span className="text-red-400 font-semibold">{selected.size}</span> page{selected.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="neon-btn px-5 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              {archiving ? (
                <><span className="animate-spin">⠋</span> Archiving…</>
              ) : (
                <><Trash2 size={12} /> Archive {selected.size} page{selected.size !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        )}

        {/* Results */}
        {result && !scanning && (
          <div className="flex flex-col gap-4">
            <CategorySection
              category="orphaned"
              pages={result.orphaned}
              selected={selected}
              archived={archived}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
            <CategorySection
              category="empty"
              pages={result.empty}
              selected={selected}
              archived={archived}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
            <CategorySection
              category="stale"
              pages={result.stale}
              selected={selected}
              archived={archived}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          </div>
        )}

        {/* All clean */}
        {result && totalFound === 0 && !scanning && (
          <div className="glass-card rounded-xl p-8 border border-emerald-400/30 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="font-semibold text-emerald-400">Workspace is clean</p>
            <p className="text-sm text-muted-foreground">
              No orphaned, empty, or stale pages found across {result.stats.scannedPages} scanned pages.
            </p>
          </div>
        )}

        {/* All archived */}
        {result && totalFound > 0 && totalActive === 0 && !scanning && (
          <div className="glass-card rounded-xl p-8 border border-emerald-400/30 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="font-semibold text-emerald-400">All done</p>
            <p className="text-sm text-muted-foreground">
              {archived.size} page{archived.size !== 1 ? 's' : ''} archived to NoteRunway Archive. Your workspace is cleaner now.
            </p>
            <button onClick={runScan} className="neon-btn-ghost px-4 py-2 text-xs mt-1">
              Run again
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
