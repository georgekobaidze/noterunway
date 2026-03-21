'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Copy, Check, ExternalLink, AlertTriangle, CheckSquare, Square } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CyberLoader } from '@/components/CyberLoader'
import { useSettings } from '@/lib/hooks/useSettings'

// ─── Types ────────────────────────────────────────────────────────────────────

type PageMeta = { id: string; title: string }

type ArchiveCandidate = { pageId: string; pageTitle: string; reason: string }

interface AskResult {
  mode: 'search' | 'report' | 'template' | 'refactor' | 'summarize' | 'archive' | 'chat'
  message: string
  resultPageIds?: string[]
  templateTitle?: string
  templateContent?: string
  templateParentTitle?: string
  targetPageId?: string
  targetPageTitle?: string
  refactoredContent?: string
  summarizedPageIds?: string[]
  archiveCandidates?: ArchiveCandidate[]
  pages?: PageMeta[]
  originalText?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'Generate a workspace health report',
  'Create a weekly project tracker template',
  'Find all pages about authentication',
  'Summarize everything under Projects',
  'Refactor my Q1 Planning page',
  'What pages should I archive?',
]

// ─── Small helpers ────────────────────────────────────────────────────────────

function notionUrl(id: string) {
  return `https://notion.so/${id.replace(/-/g, '')}`
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('# '))  return <h1 key={i} className="text-xl font-bold mt-4 mb-1">{line.slice(2)}</h1>
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold mt-3 mb-1 text-[#00d4ff]">{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold mt-2 mb-0.5 text-purple-400">{line.slice(4)}</h3>
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} className="flex gap-2"><span className="text-[#00d4ff] mt-0.5">•</span><span>{line.slice(2)}</span></div>
        if (/^\d+\. /.test(line)) return <div key={i} className="flex gap-2"><span className="text-muted-foreground">{line.match(/^\d+/)?.[0]}.</span><span>{line.replace(/^\d+\. /, '')}</span></div>
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button onClick={copy} className="neon-btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5">
      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
    </button>
  )
}

// ─── Result views ─────────────────────────────────────────────────────────────

function SearchResult({ result }: { result: AskResult }) {
  const pages = result.pages ?? []
  const hits = (result.resultPageIds ?? [])
    .map(id => pages.find(p => p.id === id))
    .filter(Boolean) as PageMeta[]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{result.message}</p>
      {hits.length === 0
        ? <p className="text-sm text-muted-foreground/60 italic">No matching pages found.</p>
        : hits.map(p => (
          <a key={p.id} href={notionUrl(p.id)} target="_blank" rel="noopener noreferrer"
            className="glass-card rounded-lg p-3 border border-white/5 hover:border-[#00d4ff]/30 flex items-center justify-between gap-3 transition-colors group">
            <span className="text-sm font-medium">{p.title}</span>
            <ExternalLink size={12} className="text-muted-foreground group-hover:text-[#00d4ff] shrink-0" />
          </a>
        ))
      }
    </div>
  )
}

function ReportResult({ result, onSave }: { result: AskResult; onSave: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card rounded-xl border border-white/5 p-5">
        <MarkdownBlock text={result.message} />
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} className="neon-btn px-5 py-2 text-sm flex items-center gap-2">
          <Sparkles size={13} /> Save to Notion
        </button>
      </div>
    </div>
  )
}

function TemplateResult({
  result, parentTitle, setParentTitle, onConfirm, executing,
}: {
  result: AskResult
  parentTitle: string
  setParentTitle: (v: string) => void
  onConfirm: () => void
  executing: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{result.message}</p>
      <div className="glass-card rounded-xl border border-[#00d4ff]/20 p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#00d4ff]">{result.templateTitle}</h3>
          <CopyButton text={result.templateContent ?? ''} />
        </div>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-80 overflow-y-auto">
          {result.templateContent}
        </pre>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground shrink-0">Create under page:</span>
        <input
          value={parentTitle}
          onChange={e => setParentTitle(e.target.value)}
          placeholder={result.templateParentTitle ?? 'Type a parent page name…'}
          className="flex-1 bg-transparent border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#00d4ff]/50"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={!parentTitle.trim() || executing}
          className="neon-btn px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-40">
          {executing ? <><span className="animate-spin">⠋</span> Creating…</> : <><Sparkles size={13} /> Create in Notion</>}
        </button>
      </div>
    </div>
  )
}

function RefactorResult({ result }: { result: AskResult }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{result.message}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl border border-white/5 p-4 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground font-mono">ORIGINAL</div>
          <pre className="text-xs whitespace-pre-wrap text-muted-foreground max-h-80 overflow-y-auto leading-relaxed">
            {result.originalText || '(empty page)'}
          </pre>
        </div>
        <div className="glass-card rounded-xl border border-[#00d4ff]/20 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#00d4ff] font-mono">PROPOSED</div>
            <CopyButton text={result.refactoredContent ?? ''} />
          </div>
          <pre className="text-xs whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
            {result.refactoredContent}
          </pre>
        </div>
      </div>
      <p className="text-xs text-muted-foreground/60">Copy the proposed content and paste it into Notion to apply the refactor.</p>
    </div>
  )
}

function ArchiveResult({
  result, selected, onToggle, onArchive, executing,
}: {
  result: AskResult
  selected: Set<string>
  onToggle: (id: string) => void
  onArchive: () => void
  executing: boolean
}) {
  const candidates = result.archiveCandidates ?? []
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{result.message}</p>
      {candidates.length === 0
        ? <p className="text-sm text-muted-foreground/60 italic">No archive candidates found.</p>
        : candidates.map(c => (
          <button key={c.pageId} onClick={() => onToggle(c.pageId)}
            className="glass-card rounded-lg p-3 border border-white/5 hover:border-white/10 flex items-start gap-3 text-left transition-colors w-full">
            {selected.has(c.pageId) ? <CheckSquare size={15} className="text-[#00d4ff] shrink-0 mt-0.5" /> : <Square size={15} className="text-muted-foreground shrink-0 mt-0.5" />}
            <div>
              <div className="text-sm font-medium">{c.pageTitle}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.reason}</div>
            </div>
          </button>
        ))
      }
      {candidates.length > 0 && (
        <button onClick={onArchive} disabled={selected.size === 0 || executing}
          className="neon-btn px-5 py-2 text-sm self-start flex items-center gap-2 disabled:opacity-40">
          {executing ? <><span className="animate-spin">⠋</span> Archiving…</> : `Archive Selected (${selected.size})`}
        </button>
      )}
    </div>
  )
}

// ─── Save to Notion modal (inline) ────────────────────────────────────────────

function SavePanel({
  pages, content, title, onSave, executing,
}: {
  pages: PageMeta[]
  content: string
  title: string
  onSave: (parentPageId: string, parentTitle: string) => void
  executing: boolean
}) {
  const [query, setQuery] = useState('')
  const matches = query.trim()
    ? pages.filter(p => p.title.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : []
  const exact = pages.find(p => p.title.toLowerCase() === query.toLowerCase())

  return (
    <div className="glass-card rounded-xl border border-[#00d4ff]/20 p-4 flex flex-col gap-3 mt-2">
      <p className="text-xs text-muted-foreground">Type a parent page name to save under:</p>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="e.g. Projects, Notes…"
        className="bg-transparent border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#00d4ff]/50"
      />
      {matches.map(p => (
        <button key={p.id} onClick={() => onSave(p.id, p.title)}
          className="text-left text-sm px-3 py-1.5 rounded hover:bg-white/5 transition-colors">
          {p.title}
        </button>
      ))}
      {query.trim() && !exact && matches.length === 0 && (
        <p className="text-xs text-muted-foreground/60">No matching page found.</p>
      )}
      {exact && (
        <button onClick={() => onSave(exact.id, exact.title)} disabled={executing}
          className="neon-btn px-4 py-1.5 text-sm self-start disabled:opacity-40">
          {executing ? 'Saving…' : `Save under "${exact.title}"`}
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AskPage() {
  const { settings, aiKey, loaded } = useSettings()
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AskResult | null>(null)
  const [executeMessage, setExecuteMessage] = useState<string | null>(null)
  const [parentTitle, setParentTitle] = useState('')
  const [selectedArchive, setSelectedArchive] = useState<Set<string>>(new Set())
  const [showSavePanel, setShowSavePanel] = useState(false)

  const pages = result?.pages ?? []

  const headers = {
    'Content-Type': 'application/json',
    'x-ai-key': aiKey ?? '',
    'x-ai-model': settings.modelId,
  }

  const handleSubmit = useCallback(async () => {
    if (!command.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setExecuteMessage(null)
    setShowSavePanel(false)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, phase: 'plan' }),
      })
      const data: AskResult & { error?: string } = await res.json()
      if (!res.ok) { setError(data.error ?? 'Request failed'); return }
      setResult(data)
      setParentTitle(data.templateParentTitle ?? '')
      if (data.archiveCandidates) {
        setSelectedArchive(new Set(data.archiveCandidates.map(c => c.pageId)))
      }
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, loading, aiKey, settings.modelId])

  const handleArchive = async () => {
    if (!result?.archiveCandidates || selectedArchive.size === 0) return
    setExecuting(true)
    const actions = result.archiveCandidates
      .filter(c => selectedArchive.has(c.pageId))
      .map(c => ({ type: 'archive' as const, pageId: c.pageId, pageTitle: c.pageTitle }))

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, phase: 'execute', executeActions: actions }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Execute failed'); return }
      setExecuteMessage(`✓ Archived ${actions.length} page${actions.length !== 1 ? 's' : ''} successfully.`)
      setSelectedArchive(new Set())
    } catch {
      setError('Network error during execute.')
    } finally {
      setExecuting(false)
    }
  }

  const handleCreate = async () => {
    if (!result?.templateContent || !result.templateTitle || !parentTitle.trim()) return
    const parentPage = pages.find(p => p.title.toLowerCase() === parentTitle.toLowerCase())
    if (!parentPage) { setError(`Could not find page "${parentTitle}" in your workspace.`); return }
    setExecuting(true)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          command, phase: 'execute',
          executeActions: [{ type: 'create', title: result.templateTitle, content: result.templateContent, parentPageId: parentPage.id }],
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Create failed'); return }
      setExecuteMessage(`✓ Created "${result.templateTitle}" in Notion.`)
    } catch {
      setError('Network error during execute.')
    } finally {
      setExecuting(false)
    }
  }

  const handleSaveReport = async (parentPageId: string, pTitle: string) => {
    if (!result) return
    setExecuting(true)
    setShowSavePanel(false)
    const title = result.mode === 'report' ? 'NoteRunway Workspace Report' : `Summary — ${new Date().toLocaleDateString()}`
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          command, phase: 'execute',
          executeActions: [{ type: 'create', title, content: result.message, parentPageId }],
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      setExecuteMessage(`✓ Saved "${title}" under "${pTitle}" in Notion.`)
    } catch {
      setError('Network error during save.')
    } finally {
      setExecuting(false)
    }
  }

  const hasKey = !!aiKey

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar rightSlot={<Link href="/settings" className="neon-btn-ghost px-8 py-3 text-sm">Settings</Link>} />

      <main className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-4xl mx-auto w-full">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#00d4ff] transition-colors w-fit mb-2">
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold neon-text" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
            Semantic Ask
          </h1>
          <p className="text-muted-foreground text-sm">
            Natural language workspace commands — generate reports, create templates, search pages, and more.
          </p>
        </div>

        {/* AI key warning */}
        {!hasKey && (
          <div className="glass-card rounded-xl p-4 border border-amber-400/30 flex items-start gap-3">
            <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-400">
              No AI key configured. <Link href="/settings" className="underline hover:text-amber-300">Add your key in Settings</Link> to use Semantic Ask.
            </p>
          </div>
        )}

        {/* Command box */}
        <div className="glass-card rounded-xl border border-white/5 p-6 flex flex-col gap-4">
          <textarea
            rows={3}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
            placeholder="Ask anything about your workspace…"
            className="w-full bg-transparent border border-white/10 rounded-lg p-4 text-sm resize-none focus:outline-none focus:border-[#00d4ff]/50 placeholder:text-muted-foreground"
            disabled={loading}
          />

          {/* Suggested prompts */}
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map(p => (
              <button key={p} onClick={() => setCommand(p)}
                className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-muted-foreground hover:border-[#00d4ff]/40 hover:text-[#00d4ff] transition-colors">
                ✦ {p}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">⌘+Enter to submit</span>
            <button onClick={handleSubmit} disabled={!command.trim() || loading || !hasKey}
              className="neon-btn px-6 py-2 flex items-center gap-2 disabled:opacity-40">
              {loading ? <><span className="animate-spin">⠋</span> Thinking…</> : <><Sparkles size={14} /> Ask</>}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="glass-card rounded-xl p-10 border border-white/5 flex flex-col items-center gap-4">
            <CyberLoader />
            <p className="text-xs font-mono text-muted-foreground">Analysing workspace…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-card rounded-xl p-4 border border-red-400/30 flex items-start gap-3">
            <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Execute success */}
        {executeMessage && (
          <div className="glass-card rounded-xl p-4 border border-green-400/30 flex items-center gap-3">
            <Check size={15} className="text-green-400 shrink-0" />
            <p className="text-sm text-green-400">{executeMessage}</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="glass-card rounded-xl border border-white/5 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#00d4ff]/30 text-[#00d4ff] bg-[#00d4ff]/10 uppercase tracking-widest">
                {result.mode}
              </span>
            </div>

            {result.mode === 'search' && <SearchResult result={result} />}

            {(result.mode === 'report' || result.mode === 'summarize') && (
              <>
                <ReportResult result={result} onSave={() => setShowSavePanel(v => !v)} />
                {showSavePanel && (
                  <SavePanel pages={pages} content={result.message} title="Report" onSave={handleSaveReport} executing={executing} />
                )}
              </>
            )}

            {result.mode === 'template' && (
              <TemplateResult
                result={result}
                parentTitle={parentTitle}
                setParentTitle={setParentTitle}
                onConfirm={handleCreate}
                executing={executing}
              />
            )}

            {result.mode === 'refactor' && <RefactorResult result={result} />}

            {result.mode === 'archive' && (
              <ArchiveResult
                result={result}
                selected={selectedArchive}
                onToggle={id => setSelectedArchive(prev => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })}
                onArchive={handleArchive}
                executing={executing}
              />
            )}

            {result.mode === 'chat' && (
              <div className="glass-card rounded-xl border border-white/5 p-5">
                <MarkdownBlock text={result.message} />
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
