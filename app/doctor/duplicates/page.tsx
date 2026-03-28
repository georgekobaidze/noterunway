'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, GitMerge, ScanSearch, AlertTriangle, ExternalLink, CheckCircle2, SkipForward, Star } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { InfoLinks } from '@/components/Landing/InfoLinks'
import { CyberLoader } from '@/components/CyberLoader'
import { useSettings } from '@/lib/hooks/useSettings'
import type { DuplicateGroup, DuplicateDetectionResult } from '@/lib/ai/DuplicateDetectionPromptBuilder'

// ─── Group Card ───────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: DuplicateGroup
  onArchive: (group: DuplicateGroup, keepId: string) => void
  onSkip: (group: DuplicateGroup) => void
  archiving: boolean
  archived: boolean
}

function GroupCard({ group, onArchive, onSkip, archiving, archived }: GroupCardProps) {
  const [selectedKeepId, setSelectedKeepId] = useState(group.suggestedKeepId)
  const pct = Math.round(group.similarity * 100)
  const accentColor =
    pct >= 90
      ? 'text-red-400 border-red-400/40'
      : pct >= 85
      ? 'text-amber-400 border-amber-400/40'
      : 'text-[#7b2fff] border-[#7b2fff]/40'

  if (archived) {
    const archivedCount = group.pages.length - 1
    return (
      <div className="glass-card rounded-xl p-5 border border-emerald-400/30 flex items-center gap-3 opacity-60">
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        <span className="text-sm text-emerald-400 font-mono">
          {archivedCount} page{archivedCount !== 1 ? 's' : ''} archived from group &quot;{group.pages[0]?.title || '(untitled)'}&quot;
        </span>
      </div>
    )
  }

  const archiveIds = group.pages.filter((p) => p.id !== selectedKeepId).map((p) => p.id)
  const keepPage = group.pages.find((p) => p.id === selectedKeepId)

  return (
    <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <span className="text-xs font-mono text-muted-foreground">{group.reason}</span>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${accentColor}`}>
          {pct}% similar · {group.pages.length} pages
        </span>
      </div>

      {/* Page list */}
      <div className="divide-y divide-white/5">
        {group.pages.map((page) => {
          const isKeep = page.id === selectedKeepId
          const isSuggested = page.id === group.suggestedKeepId
          return (
            <div
              key={page.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedKeepId(page.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedKeepId(page.id)
                }
              }}
              className={`w-full text-left px-5 py-4 flex items-start gap-3 transition-colors ${
                isKeep ? 'bg-emerald-400/5' : 'hover:bg-white/[0.02]'
              }`}
            >
              {/* Radio */}
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  isKeep ? 'border-emerald-400' : 'border-white/20'
                }`}
              >
                {isKeep && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold leading-snug ${isKeep ? 'text-emerald-400' : 'text-foreground'}`}>
                    {page.title || <span className="italic text-muted-foreground">(untitled)</span>}
                  </span>
                  {isSuggested && (
                    <span className="flex items-center gap-0.5 text-[10px] font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.5 rounded">
                      <Star size={8} className="fill-current" /> AI pick
                    </span>
                  )}
                  {isKeep && !isSuggested && (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                      keep
                    </span>
                  )}
                </div>
                <a
                  href={`https://notion.so/${page.id.replace(/-/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[#00d4ff] transition-colors mt-1"
                >
                  <ExternalLink size={10} /> Open in Notion
                </a>
              </div>

              {!isKeep && (
                <span className="text-[10px] font-mono text-red-400/60 mt-0.5 flex-shrink-0">archive</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-5 py-3 border-t border-white/5 bg-white/[0.01]">
        <button
          onClick={() => onArchive(group, selectedKeepId)}
          disabled={archiving}
          className="neon-btn px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40"
        >
          {archiving ? (
            <span className="flex items-center gap-1.5"><span className="neon-spinner" /> Archiving…</span>
          ) : (
            <><GitMerge size={12} /> Archive {archiveIds.length} page{archiveIds.length !== 1 ? 's' : ''} · Keep &quot;{keepPage?.title || '(untitled)'}&quot;</>
          )}
        </button>
        <button
          onClick={() => onSkip(group)}
          disabled={archiving}
          className="neon-btn-ghost px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40"
        >
          <SkipForward size={12} /> Skip
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DuplicatesPage() {
  const { settings, aiKey, loaded } = useSettings()
  const [result, setResult] = useState<(DuplicateDetectionResult & { stats?: { totalPages: number; scannedPages: number; skippedEmpty?: number; exactMatchGroups: number; aiGroups: number } }) | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // keyed by the first page id in the group as a stable group identifier
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [archiving, setArchiving] = useState<string | null>(null)

  const groupKey = (g: DuplicateGroup) => g.pages.map((p) => p.id).sort().join(',')

  const runScan = async () => {
    if (!aiKey) {
      setError('No AI key configured. Go to Settings and add your API key.')
      return
    }
    setScanning(true)
    setError(null)
    setResult(null)
    setSkipped(new Set())
    setArchived(new Set())

    try {
      const res = await fetch('/api/duplicates', {
        headers: {
          'x-ai-key': aiKey,
          'x-ai-model': settings.modelId,
        },
      })
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

  const handleArchive = async (group: DuplicateGroup, keepId: string) => {
    const key = groupKey(group)
    setArchiving(key)
    const archivePages = group.pages.filter((p) => p.id !== keepId).map((p) => ({ id: p.id, title: p.title }))
    const keepPage = group.pages.find((p) => p.id === keepId)
    try {
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archivePages,
          keepTitle: keepPage?.title ?? '',
          reason: group.reason,
        }),
      })
      if (res.ok) {
        setArchived((prev) => new Set([...prev, key]))
      } else {
        const data = await res.json()
        setError(data.error ?? 'Archive failed.')
      }
    } catch {
      setError('Network error — could not archive pages.')
    } finally {
      setArchiving(null)
    }
  }

  const handleSkip = (group: DuplicateGroup) => {
    setSkipped((prev) => new Set([...prev, groupKey(group)]))
  }

  const visibleGroups = result?.groups.filter(
    (g) => !skipped.has(groupKey(g)) && !archived.has(groupKey(g))
  ) ?? []

  const doneCount = archived.size + skipped.size

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar rightSlot={
        <div className="flex items-center gap-3">
          <InfoLinks />
          <Link href="/dashboard" className="neon-btn-ghost text-sm w-32 text-center py-3">Dashboard</Link>
        </div>
      } />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-[#00d4ff]/70 hover:text-[#00d4ff] transition-colors w-fit mb-3">
            <ArrowLeft size={15} /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold neon-text" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
            Duplicate Detection
          </h1>
          <p className="text-sm" style={{ color: '#00d4ff' }}>
            AI scans your page titles and content to find duplicates — grouped so you choose which version to keep.
          </p>
        </div>

        {/* No AI key warning */}
        {loaded && !aiKey && (
          <div className="glass-card rounded-xl p-5 border border-amber-400/30 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="text-amber-400 font-semibold">AI key required. </span>
              <Link href="/settings" className="text-[#00d4ff] hover:underline">Add your key in Settings →</Link>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-card rounded-xl p-5 border border-red-400/30 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Scan button */}
        <div className="flex items-center gap-4">
          <button
            onClick={runScan}
            disabled={scanning || !loaded}
            className="neon-btn px-6 py-2.5 flex items-center gap-2 disabled:opacity-40"
          >
            {scanning ? (
              <><span className="neon-spinner" /> Scanning…</>
            ) : (
              <><ScanSearch size={14} /> {result ? 'Rescan' : 'Run AI Scan'}</>
            )}
          </button>
          {result && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-mono text-muted-foreground">
                {result.groups.length === 0
                  ? '✦ No duplicates found'
                  : `✦ ${result.groups.length} group${result.groups.length !== 1 ? 's' : ''} found · ${doneCount} resolved`}
              </span>
              {result.stats && (
                <span className="text-[11px] font-mono text-muted-foreground/60">
                  {result.stats.scannedPages} pages scanned
                  {(result.stats.skippedEmpty ?? 0) > 0 && ` · ${result.stats.skippedEmpty} empty skipped`}
                  {result.stats.exactMatchGroups > 0 && ` · ${result.stats.exactMatchGroups} exact title match${result.stats.exactMatchGroups !== 1 ? 'es' : ''}`}
                  {result.stats.aiGroups > 0 && ` · ${result.stats.aiGroups} AI-detected`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Loading */}
        {scanning && (
          <div className="glass-card rounded-xl p-10 border border-white/5 flex flex-col items-center gap-4">
            <CyberLoader />
            <p className="text-xs font-mono text-muted-foreground">AI is scanning titles and content…</p>
          </div>
        )}

        {/* Reasoning */}
        {result && result.reasoning && !scanning && (
          <div className="glass-card rounded-xl p-4 border border-[#00d4ff]/10">
            <p className="text-xs font-mono text-muted-foreground leading-relaxed">
              <span className="text-[#00d4ff]">✦ AI: </span>{result.reasoning}
            </p>
          </div>
        )}

        {/* Groups */}
        {!scanning && visibleGroups.length > 0 && (
          <div className="flex flex-col gap-4">
            {visibleGroups.map((group) => {
              const key = groupKey(group)
              return (
                <GroupCard
                  key={key}
                  group={group}
                  onArchive={handleArchive}
                  onSkip={handleSkip}
                  archiving={archiving === key}
                  archived={archived.has(key)}
                />
              )
            })}
          </div>
        )}

        {/* Archived items (collapsed summary) */}
        {archived.size > 0 && !scanning && (
          <div className="flex flex-col gap-2">
            {result?.groups
              .filter((g) => archived.has(groupKey(g)))
              .map((group) => {
                const key = groupKey(group)
                return (
                  <GroupCard
                    key={`done-${key}`}
                    group={group}
                    onArchive={handleArchive}
                    onSkip={handleSkip}
                    archiving={false}
                    archived={true}
                  />
                )
              })}
          </div>
        )}

        {/* All done */}
        {result && result.groups.length > 0 && visibleGroups.length === 0 && !scanning && (
          <div className="glass-card rounded-xl p-8 border border-emerald-400/30 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="font-semibold text-emerald-400">All groups resolved</p>
            <p className="text-sm text-muted-foreground">
              {archived.size > 0 && `${archived.size} group${archived.size !== 1 ? 's' : ''} archived. `}
              Your workspace is cleaner now.
            </p>
            <button onClick={runScan} className="neon-btn-ghost px-4 py-2 text-xs mt-1">Run again</button>
          </div>
        )}

        {/* No duplicates */}
        {result && result.groups.length === 0 && !scanning && (
          <div className="glass-card rounded-xl p-8 border border-emerald-400/30 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="font-semibold text-emerald-400">No duplicates found</p>
            <p className="text-sm text-muted-foreground">
              No duplicate pages detected across {result.stats?.totalPages ?? '?'} pages.
            </p>
            {result.stats && (
              <p className="text-xs font-mono text-muted-foreground/60">
                Exact title check: all {result.stats.totalPages} pages · AI semantic check: {result.stats.scannedPages} pages
              </p>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

