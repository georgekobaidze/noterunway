'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { InfoLinks } from '@/components/Landing/InfoLinks'
import { useSettings } from '@/lib/hooks/useSettings'

// ─── Types ────────────────────────────────────────────────────────────────────

type Action =
  | { type: 'archive'; pageId: string; pageTitle: string; reason: string }
  | { type: 'create'; parentPageId: string; title: string; content: string }
  | { type: 'update'; pageId: string; pageTitle: string; content: string }

type ToolStep = {
  stepId: string
  tool: string
  args: Record<string, unknown>
  done: boolean
  success?: boolean
}

type ProposedActions = {
  summary: string
  actions: Action[]
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolSteps: ToolStep[]
  proposedActions?: ProposedActions
  status: 'streaming' | 'done' | 'error'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What pages do I have?',
  'Search for a page',
  'Summarize a page for me',
  'Create a new page',
  'Archive a page',
]

const TOOL_LABELS: Record<string, string> = {
  search_pages: 'Searching workspace',
  get_page: 'Reading page',
  get_page_content: 'Reading page content',
  run_analysis: 'Analyzing workspace',
  propose_actions: 'Preparing actions',
}

const ACTION_ICONS: Record<string, string> = {
  archive: '🗃',
  create: '📄',
  update: '✏️',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { settings, aiKey } = useSettings()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      toolSteps: [],
      status: 'done',
    }
    const assistantMsgId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      toolSteps: [],
      status: 'streaming',
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsStreaming(true)

    // Build conversation history (text-only) for the API
    const history = [
      ...messages
        .filter(m => m.status === 'done')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        .filter(m => m.content),
      { role: 'user' as const, content: text.trim() },
    ]

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-key': aiKey ?? '',
          'x-ai-model': settings.modelId,
        },
        body: JSON.stringify({ messages: history }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: `Error: ${err.error}`, status: 'error' } : m
        ))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by double newlines
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const lines = chunk.split('\n')
          let eventType = ''
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) dataStr = line.slice(6)
          }
          if (!eventType || !dataStr) continue

          try {
            const data = JSON.parse(dataStr)

            if (eventType === 'text') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: m.content + data } : m
              ))
            } else if (eventType === 'tool_start') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, toolSteps: [...m.toolSteps, { stepId: data.stepId, tool: data.tool, args: data.args, done: false }] }
                  : m
              ))
            } else if (eventType === 'tool_end') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, toolSteps: m.toolSteps.map(s => s.stepId === data.stepId ? { ...s, done: true, success: data.success } : s) }
                  : m
              ))
            } else if (eventType === 'propose_actions') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, proposedActions: { summary: data.summary, actions: data.actions } }
                  : m
              ))
            } else if (eventType === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, status: 'done' } : m
              ))
            } else if (eventType === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content || `Error: ${data.message}`, status: 'error' }
                  : m
              ))
            }
          } catch {
            // ignore malformed event data
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: `Error: ${message}`, status: 'error' } : m
      ))
    } finally {
      setIsStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, isStreaming, aiKey, settings.modelId])

  const handleApprove = useCallback(async (msgId: string, actions: Action[]) => {
    setExecutingId(msgId)
    try {
      const res = await fetch('/api/ask/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      })
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}

      if (!res.ok) {
        throw new Error(data.message ?? `Server error ${res.status}`)
      }

      const lines = [
        ...(data.results ?? []).map((r: string) => `✓ ${r}`),
        ...(data.failedActions ?? []).map((r: string) => `✗ ${r}`),
      ]

      const resultMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: lines.join('\n') || 'Done.',
        toolSteps: [],
        status: 'done',
      }

      setMessages(prev => [
        ...prev.map(m => m.id === msgId ? { ...m, proposedActions: undefined } : m),
        resultMsg,
      ])
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Execution error: ${message}`, toolSteps: [], status: 'error' },
      ])
    } finally {
      setExecutingId(null)
    }
  }, [])

  const handleReject = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, proposedActions: undefined } : m
    ))
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Actions cancelled.',
      toolSteps: [],
      status: 'done',
    }])
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const noKey = !aiKey
  const pendingApproval = messages.some(m => m.proposedActions != null)

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <Navbar rightSlot={
        <div className="flex items-center gap-3">
          <InfoLinks />
          <Link href="/dashboard" className="neon-btn-ghost text-sm w-32 text-center py-3">Dashboard</Link>
        </div>
      } />

      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-4 gap-3 overflow-hidden min-h-0">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-[#00d4ff]/70 hover:text-[#00d4ff] transition-colors w-fit">
          <ArrowLeft size={15} /> Dashboard
        </Link>

        {/* Terminal window */}
        <div
          className="flex-1 flex flex-col rounded-xl border border-white/10 bg-black/60 overflow-hidden font-mono text-sm min-h-0"
        >
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02] shrink-0">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/50" />
            </div>
            <span className="text-xs text-muted-foreground/50 ml-2 tracking-wide">noterunway — ask</span>
          </div>

          {/* Messages */}
          <div className="terminal-scroll flex-1 overflow-y-auto p-5 space-y-5">

            {messages.length === 0 && (
              <div className="flex flex-col gap-5 py-4">
                <div className="text-xs leading-relaxed" style={{ color: '#00d4ff' }}>
                  Ask anything about your Notion workspace. I can search, read, summarize, and propose changes.
                </div>
                <div className="flex flex-col gap-1">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => sendMessage(s)}
                      className="text-left text-xs transition-colors py-0.5 w-fit"
                      style={{ color: '#00d4ff', opacity: 0.45 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}>
                      <span className="mr-2" style={{ color: '#00d4ff', opacity: 0.3 }}>$</span>{s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className="flex flex-col gap-1.5">
                {msg.role === 'user' ? (
                  <div className="flex gap-2.5 items-start">
                    <span className="text-[#00d4ff] shrink-0 mt-px">❯</span>
                    <span className="text-[#00ff88]/90 leading-relaxed">{msg.content}</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pl-5">
                    {/* Tool call steps */}
                    {msg.toolSteps.map(step => (
                      <div key={step.stepId} className="flex items-center gap-2 text-xs text-[#00d4ff]/30">
                        {step.done
                          ? (step.success
                            ? <span className="text-green-500/50">✓</span>
                            : <span className="text-red-500/50">✗</span>)
                          : <span className="neon-spinner" />
                        }
                        <span>{TOOL_LABELS[step.tool] ?? step.tool}</span>
                        {step.args.query != null && (
                          <span className="text-muted-foreground/25">&quot;{String(step.args.query)}&quot;</span>
                        )}
                        {step.args.page_id != null && (
                          <span className="text-muted-foreground/25">{String(step.args.page_id).slice(0, 8)}…</span>
                        )}
                        {step.args.type != null && (
                          <span className="text-muted-foreground/25">{String(step.args.type).replace(/_/g, ' ')}</span>
                        )}
                      </div>
                    ))}

                    {/* AI response text */}
                    {msg.content && (
                      <div className={`leading-relaxed whitespace-pre-wrap text-sm ${
                        msg.status === 'error' ? 'text-red-400/70' : 'text-[#00d4ff]/75'
                      }`}>
                        {msg.content}
                        {msg.status === 'streaming' && (
                          <span className="animate-pulse ml-0.5 text-[#00d4ff]">█</span>
                        )}
                      </div>
                    )}

                    {/* Proposed actions approval card */}
                    {msg.proposedActions && (
                      <div className="mt-1 border border-amber-500/25 rounded-lg p-3.5 bg-amber-500/5">
                        <div className="text-xs text-amber-400/60 font-semibold uppercase tracking-widest mb-2.5">
                          Proposed actions
                        </div>
                        <div className="flex flex-col gap-1.5 mb-3.5">
                          {msg.proposedActions.actions.map((a, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0 mt-px">{ACTION_ICONS[a.type] ?? '•'}</span>
                              <div className="text-muted-foreground/70">
                                <span className="text-amber-300/70 mr-1.5">{a.type}</span>
                                <span>{'pageTitle' in a ? a.pageTitle : ('title' in a ? a.title : '')}</span>
                                {'reason' in a && (
                                  <span className="text-muted-foreground/35 ml-1.5">— {a.reason}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(msg.id, msg.proposedActions!.actions)}
                            disabled={executingId === msg.id}
                            className="neon-btn px-4 py-1.5 text-xs disabled:opacity-40 flex items-center gap-1.5"
                          >
                            {executingId === msg.id
                           ? <><span className="neon-spinner" /> Executing…</>
                              : `Confirm (${msg.proposedActions.actions.length})`}
                          </button>
                          <button
                            onClick={() => handleReject(msg.id)}
                            disabled={executingId === msg.id}
                            className="neon-btn-ghost px-4 py-1.5 text-xs disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/5 px-5 py-3.5 shrink-0">
            {noKey ? (
              <p className="text-xs text-amber-400/60">
                ⚠ No AI key configured.{' '}
                <Link href="/settings" className="underline hover:text-amber-400">Add one in Settings</Link>
              </p>
            ) : pendingApproval ? (
              <p className="text-xs text-amber-400/60 flex items-center gap-2">
                <span className="animate-pulse">⠿</span>
                Pending approval — use the <span className="text-amber-300">Confirm</span> or <span className="text-amber-300">Cancel</span> buttons above to proceed.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
                <span className="text-[#00d4ff] shrink-0">❯</span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={isStreaming}
                  placeholder={isStreaming ? '' : 'Ask anything about your workspace…'}
                  className="flex-1 bg-transparent outline-none text-[#00d4ff]/90 placeholder:text-[#00d4ff]/20 disabled:opacity-40 text-sm caret-[#00d4ff]"
                  autoComplete="off"
                  spellCheck={false}
                />
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
