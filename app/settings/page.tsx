'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { InfoLinks } from '@/components/Landing/InfoLinks'
import { useSettings } from '@/lib/hooks/useSettings'
import { MODEL_META, type ModelId } from '@/lib/models'

const PROVIDER_MODELS = {
  openai:    MODEL_META.filter((m) => m.provider === 'openai'),
  anthropic: MODEL_META.filter((m) => m.provider === 'anthropic'),
  xai:       MODEL_META.filter((m) => m.provider === 'xai'),
  google:    MODEL_META.filter((m) => m.provider === 'google'),
}

const PROVIDER_KEY_PLACEHOLDER = {
  openai:    'sk-...',
  anthropic: 'sk-ant-...',
  xai:       'xai-...',
  google:    'AIza...',
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  )
}

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const { settings, aiKey, save, loaded } = useSettings()
  const [notionWorkspace, setNotionWorkspace] = useState<{ name: string; id: string } | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/notion/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setConnected(true)
          setNotionWorkspace(data.workspace)
        }
      })
      .catch(() => {})
  }, [searchParams])

  const oauthError = searchParams.get('error')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar rightSlot={
        <div className="flex items-center gap-3">
          <InfoLinks />
          {connected && <Link href="/dashboard" className="neon-btn-ghost text-sm w-32 text-center py-3">Dashboard</Link>}
        </div>
      } />

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-bold neon-text mb-1" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
            Settings
          </h1>
          <p className="text-sm font-mono" style={{ color: 'rgba(0,212,255,0.5)' }}>Connect your Notion workspace and configure your AI provider.</p>
        </div>

        {!loaded ? (
          <div className="flex flex-col gap-6">
            <div className="glass-card neon-border rounded-xl p-6 h-32 animate-pulse opacity-30" />
            <div className="glass-card neon-border rounded-xl p-6 h-64 animate-pulse opacity-30" />
          </div>
        ) : (
          <>
            {/* Notion connection */}
            <section className="glass-card neon-border rounded-xl p-6 flex flex-col gap-4">
              <h2 className="text-sm font-semibold tracking-widest uppercase text-[#00d4ff]" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
                Notion Workspace
              </h2>

              {oauthError && (
                <p className="text-red-400 text-sm">
                  Connection failed: {oauthError.replace(/_/g, ' ')}. Please try again.
                </p>
              )}

              {connected && notionWorkspace ? (
                <div className="flex flex-col gap-3">
                  <div
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.04)' }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{
                        display: 'inline-block',
                        width: 8, height: 8,
                        borderRadius: '50%',
                        background: '#00ff88',
                        boxShadow: '0 0 6px #00ff88, 0 0 12px rgba(0,255,136,0.5)',
                        flexShrink: 0,
                      }} />
                      <div>
                        <p className="text-xs font-mono uppercase tracking-widest" style={{ color: '#00ff88' }}>Connected</p>
                        <p className="font-mono font-semibold text-sm" style={{ color: '#00d4ff' }}>{notionWorkspace.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href="/api/notion/auth" className="neon-btn-ghost px-4 py-2 text-xs">
                        Reconnect
                      </a>
                      <form method="POST" action="/api/notion/disconnect">
                        <button type="submit" className="neon-btn-danger px-4 py-2 text-xs">
                          Disconnect
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 font-mono">
                    New pages not showing up? Reconnect and select your workspace name at the top of Notion&apos;s page list to grant access to all pages.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-sm">
                    Authorize NoteRunway to access your Notion workspace. You&apos;ll be redirected to Notion and back.
                  </p>
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded border border-emerald-400/30 bg-emerald-400/5 text-xs text-emerald-400 font-mono">
                    <span className="mt-px shrink-0">⚠</span>
                    <span>
                      On the Notion authorization screen, select{' '}
                      <strong className="text-emerald-300">your workspace name at the top of the page list</strong>
                      {' '}— not individual pages. This grants access to all pages including ones you create later.
                    </span>
                  </div>
                  <a href="/api/notion/auth" className="neon-btn px-6 py-2.5 self-start">
                    Connect Notion →
                  </a>
                </div>
              )}
            </section>

            {/* AI settings */}
            <section className="glass-card neon-border rounded-xl p-6 flex flex-col gap-5">
              <h2 className="text-sm font-semibold tracking-widest uppercase text-[#00d4ff]" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
                AI Provider
              </h2>

              <p className="text-muted-foreground text-xs -mt-2">
                Your key is stored in browser localStorage only and sent per-request to NoteRunway&apos;s APIs via a request header — it is never persisted server-side.
              </p>

              {/* Provider selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">Provider</label>
                <div className="flex gap-2">
                  {(['openai', 'anthropic', 'xai', 'google'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => save({ aiProvider: p, modelId: PROVIDER_MODELS[p][0].id })}
                      className={`px-4 py-2 text-xs border transition-all ${
                        settings.aiProvider === p
                          ? 'border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff]/10'
                          : 'border-border text-muted-foreground hover:border-[#00d4ff]/40'
                      }`}
                      style={{ fontFamily: 'var(--font-orbitron), sans-serif', letterSpacing: '0.08em' }}
                    >
                      {p === 'xai' ? 'xAI Grok' : p === 'google' ? 'Google' : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">Model</label>
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_MODELS[settings.aiProvider].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => save({ modelId: m.id as ModelId })}
                      className={`px-3 py-1.5 text-xs border transition-all ${
                        settings.modelId === m.id
                          ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10'
                          : 'border-border text-muted-foreground hover:border-[#00ff88]/40'
                      }`}
                    >
                      {m.label}
                      {m.tier === 'fast' && <span className="ml-1 opacity-50 text-[10px]">fast</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  {settings.aiProvider === 'xai' ? 'xAI' : settings.aiProvider.charAt(0).toUpperCase() + settings.aiProvider.slice(1)} API Key
                </label>
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => save({ aiKey: e.target.value })}
                  placeholder={PROVIDER_KEY_PLACEHOLDER[settings.aiProvider]}
                  className="bg-transparent border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:border-[#00d4ff] focus:outline-none transition-colors"
                />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
