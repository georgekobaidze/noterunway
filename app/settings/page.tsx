'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { useSettings } from '@/lib/hooks/useSettings'
import { MODEL_META, type ModelId } from '@/lib/models'

const PROVIDER_MODELS = {
  openai:    MODEL_META.filter((m) => m.provider === 'openai'),
  anthropic: MODEL_META.filter((m) => m.provider === 'anthropic'),
  xai:       MODEL_META.filter((m) => m.provider === 'xai'),
}

const PROVIDER_KEY_PLACEHOLDER = {
  openai:    'sk-...',
  anthropic: 'sk-ant-...',
  xai:       'xai-...',
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const { settings, save, loaded } = useSettings()
  const [notionWorkspace, setNotionWorkspace] = useState<{ name: string; id: string } | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Read workspace cookie set by OAuth callback
    const match = document.cookie.match(/notion_workspace=([^;]+)/)
    if (match) {
      try { setNotionWorkspace(JSON.parse(decodeURIComponent(match[1]))) } catch {}
    }
  }, [searchParams])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const connected = searchParams.get('connected') === 'true' || !!notionWorkspace
  const oauthError = searchParams.get('error')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar rightSlot={
        connected
          ? <Link href="/dashboard" className="neon-btn px-8 py-3 text-sm">Go to Dashboard →</Link>
          : undefined
      } />

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
            Settings
          </h1>
          <p className="text-muted-foreground text-sm">Connect your Notion workspace and configure your AI provider.</p>
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-emerald-400">✦ Connected</p>
                    <p className="text-foreground font-medium">{notionWorkspace.name}</p>
                  </div>
                  <a href="/api/notion/auth" className="neon-btn-ghost px-4 py-2 text-xs">
                    Reconnect
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-sm">
                    Authorize NoteRunway to access your Notion workspace. You&apos;ll be redirected to Notion and back.
                  </p>
                  <a href="/api/notion/auth" className="neon-btn px-6 py-2.5 self-start">
                    Connect Notion →
                  </a>
                </div>
              )}
            </section>

            {/* AI settings */}
            <form onSubmit={handleSave}>
              <section className="glass-card neon-border rounded-xl p-6 flex flex-col gap-5">
                <h2 className="text-sm font-semibold tracking-widest uppercase text-[#00d4ff]" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
                  AI Provider
                </h2>

                <p className="text-muted-foreground text-xs -mt-2">
                  Your key is stored in browser localStorage only — never sent to NoteRunway&apos;s servers.
                </p>

                {/* Provider selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">Provider</label>
                  <div className="flex gap-2">
                    {(['openai', 'anthropic', 'xai'] as const).map((p) => (
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
                        {p === 'xai' ? 'xAI Grok' : p.charAt(0).toUpperCase() + p.slice(1)}
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
                            ? 'border-[#7b2fff] text-[#7b2fff] bg-[#7b2fff]/10'
                            : 'border-border text-muted-foreground hover:border-[#7b2fff]/40'
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
                  <label className="text-xs text-muted-foreground uppercase tracking-widest">API Key</label>
                  <input
                    type="password"
                    value={settings.aiKey}
                    onChange={(e) => save({ aiKey: e.target.value })}
                    placeholder={PROVIDER_KEY_PLACEHOLDER[settings.aiProvider]}
                    className="bg-transparent border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:border-[#00d4ff] focus:outline-none transition-colors"
                  />
                </div>

                <button type="submit" className="neon-btn px-6 py-2.5 self-start">
                  {saved ? '✦ Saved' : 'Save Settings'}
                </button>
              </section>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
