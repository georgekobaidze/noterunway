'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ScanSearch,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CyberLoader } from '@/components/CyberLoader'
import { useSettings } from '@/lib/hooks/useSettings'
import type { SensitiveFinding, SensitiveScanResult, SensitiveCategory } from '@/lib/notion/NotionClient'

// ─── Category badges ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  api_key:    'API Key',
  credential: 'Credential',
  pii:        'PII',
  crypto:     'Crypto',
}

const CATEGORY_COLORS: Record<SensitiveCategory, string> = {
  api_key:    'text-orange-400 bg-orange-400/10 border-orange-400/20',
  credential: 'text-red-400 bg-red-400/10 border-red-400/20',
  pii:        'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  crypto:     'text-purple-400 bg-purple-400/10 border-purple-400/20',
}

function CategoryBadge({ category }: { category: SensitiveCategory }) {
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

// ─── Group findings by page ───────────────────────────────────────────────────

function groupByPage(findings: SensitiveFinding[]): Map<string, SensitiveFinding[]> {
  const map = new Map<string, SensitiveFinding[]>()
  for (const f of findings) {
    const existing = map.get(f.sourcePageId) ?? []
    existing.push(f)
    map.set(f.sourcePageId, existing)
  }
  return map
}

// ─── Page card ────────────────────────────────────────────────────────────────

function PageCard({
  pageId,
  findings,
  isAI = false,
}: {
  pageId: string
  findings: SensitiveFinding[]
  isAI?: boolean
}) {
  const pageTitle = findings[0].sourcePageTitle
  const borderColor = isAI ? 'border-[#00d4ff]/20' : 'border-orange-400/20'
  const iconColor = isAI ? 'text-[#00d4ff]' : 'text-orange-400'
  const countColor = isAI ? 'text-[#00d4ff] bg-[#00d4ff]/10' : 'text-orange-400 bg-orange-400/10'

  return (
    <div className={`glass-card rounded-xl border ${borderColor} overflow-hidden`}>
      {/* Page header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert size={13} className={`${iconColor} shrink-0`} />
          <span className="text-sm font-semibold truncate">
            {pageTitle || <span className="italic text-muted-foreground">(untitled)</span>}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${countColor}`}>
            {findings.length} finding{findings.length !== 1 ? 's' : ''}
          </span>
          <a
            href={`https://notion.so/${pageId.replace(/-/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[#00d4ff] transition-colors"
          >
            <ExternalLink size={10} /> Open
          </a>
        </div>
      </div>

      {/* Findings list */}
      <div className="divide-y divide-white/5">
        {findings.map((f, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 flex-wrap">
            <div className={`w-1.5 h-1.5 rounded-full ${isAI ? 'bg-[#00d4ff]/60' : 'bg-orange-400/60'} shrink-0`} />
            <CategoryBadge category={f.category} />
            <span className="text-xs text-muted-foreground">{f.patternName}</span>
            <code className={`text-xs font-mono px-2 py-0.5 rounded ml-auto ${isAI ? 'text-[#00d4ff]/80 bg-[#00d4ff]/5' : 'text-orange-300/80 bg-orange-400/5'}`}>
              {f.redactedSnippet}
            </code>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SensitiveDataPage() {
  const { settings, aiKey, loaded } = useSettings()
  const [result, setResult] = useState<SensitiveScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deepAI, setDeepAI] = useState(false)

  const runScan = async () => {
    setScanning(true)
    setError(null)
    setResult(null)

    const url = deepAI ? '/api/sensitive?deepAI=true' : '/api/sensitive'
    const headers: Record<string, string> = {}
    if (deepAI && aiKey) {
      headers['x-ai-key'] = aiKey
      headers['x-ai-model'] = settings.modelId
    }

    try {
      const res = await fetch(url, { headers })
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

  const grouped = result ? groupByPage(result.findings) : new Map<string, SensitiveFinding[]>()
  const groupedAI = result ? groupByPage(result.aiFindings) : new Map<string, SensitiveFinding[]>()
  const totalFindings = (result?.stats.findingCount ?? 0) + (result?.stats.aiFindingCount ?? 0)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        rightSlot={
          <Link href="/settings" className="neon-btn-ghost px-8 py-3 text-sm">
            Settings
          </Link>
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
            Sensitive Data Finder
          </h1>
          <p className="text-muted-foreground text-sm">
            Deep-scans every page for accidentally stored{' '}
            <span className="text-foreground">API keys, tokens, passwords, and PII</span>.
            Matches are redacted — just enough to confirm, not expose.
          </p>
        </div>

        {/* Deep AI scan toggle */}
        <div className="glass-card rounded-xl p-4 border border-white/5 flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deepAI}
              onChange={(e) => setDeepAI(e.target.checked)}
              className="w-4 h-4 accent-[#00d4ff] cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-[#00d4ff]" />
              <span className="text-sm font-medium">Deep AI Scan</span>
              <span className="text-[10px] font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.5 rounded border border-[#00d4ff]/20">AI</span>
            </div>
          </label>
          {deepAI && (
            <div className="flex flex-col gap-2 pl-7">
              <p className="text-xs text-muted-foreground">
                Uses AI to detect secrets written in natural language (e.g.{' '}
                <span className="text-foreground font-mono">&quot;the password is: hunter2&quot;</span>
                ) that regex patterns miss. AI findings are shown separately and never overlap with regex results.
              </p>
              <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                <AlertTriangle size={11} />
                Sends page text to your configured AI model — costs tokens and takes longer for large workspaces.
              </p>
              {loaded && !aiKey && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertTriangle size={11} />
                  No AI key configured.{' '}
                  <Link href="/settings" className="underline hover:text-[#00d4ff]">
                    Add one in Settings.
                  </Link>
                </p>
              )}
            </div>
          )}
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
            disabled={scanning || (deepAI && loaded && !aiKey)}
            className="neon-btn px-6 py-2.5 flex items-center gap-2 disabled:opacity-40"
          >
            {scanning ? (
              <><span className="animate-spin text-sm">⠋</span> Scanning…</>
            ) : (
              <><ScanSearch size={14} /> {result ? 'Rescan' : 'Scan Workspace'}</>
            )}
          </button>

          {result && !scanning && (() => {
            const pagesWithFindings = new Set([
              ...grouped.keys(),
              ...groupedAI.keys(),
            ]).size

            return (
              <span className="text-xs font-mono text-muted-foreground">
                {totalFindings === 0
                  ? '✦ No sensitive data found'
                  : `✦ ${totalFindings} finding${totalFindings !== 1 ? 's' : ''} across ${pagesWithFindings} page${pagesWithFindings !== 1 ? 's' : ''}`}
              </span>
            )
          })()}
        </div>

        {/* Stats row */}
        {result && !scanning && (
          <div className="flex flex-wrap gap-3">
            <div className="glass-card rounded-lg px-4 py-2 border border-orange-400/20 flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-orange-400">{result.stats.findingCount}</span>
              <span className="text-xs text-muted-foreground">regex findings</span>
            </div>
            {result.stats.aiFindingCount > 0 && (
              <div className="glass-card rounded-lg px-4 py-2 border border-[#00d4ff]/20 flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-[#00d4ff]">{result.stats.aiFindingCount}</span>
                <span className="text-xs text-muted-foreground">AI findings</span>
              </div>
            )}
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
            <p className="text-xs font-mono text-muted-foreground">
              {deepAI ? 'Running regex + AI deep scan across all blocks…' : 'Deep-scanning all blocks for sensitive patterns…'}
            </p>
          </div>
        )}

        {/* Regex results */}
        {result && !scanning && grouped.size > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Pattern Findings
            </h2>
            {[...grouped.entries()].map(([pageId, findings]) => (
              <PageCard key={pageId} pageId={pageId} findings={findings} />
            ))}
          </div>
        )}

        {/* AI results */}
        {result && !scanning && groupedAI.size > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                AI Findings
              </h2>
              <span className="text-[10px] font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.5 rounded border border-[#00d4ff]/20">
                not caught by regex
              </span>
            </div>
            {[...groupedAI.entries()].map(([pageId, findings]) => (
              <PageCard key={pageId} pageId={pageId} findings={findings} isAI />
            ))}
          </div>
        )}

        {/* All clean */}
        {result && totalFindings === 0 && !scanning && (
          <div className="glass-card rounded-xl p-8 border border-emerald-400/30 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="font-semibold text-emerald-400">No sensitive data found</p>
            <p className="text-sm text-muted-foreground">
              Scanned {result.stats.scannedPages} pages — no API keys, tokens, credentials, or PII detected.
            </p>
          </div>
        )}

      </main>
    </div>
  )
}


