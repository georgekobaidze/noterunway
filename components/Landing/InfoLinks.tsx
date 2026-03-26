'use client'

import { useState } from 'react'
import { X, Github, Linkedin, Twitter, BookOpen } from 'lucide-react'

type Panel = 'built-by' | 'contribute' | 'whats-next' | null

export function InfoLinks() {
  const [open, setOpen] = useState<Panel>(null)

  const toggle = (panel: Panel) => setOpen(prev => prev === panel ? null : panel)
  const close = () => setOpen(null)

  return (
    <>
      {/* Links row */}
      <div className="flex items-center gap-1 font-mono text-xs">
        {(['built-by', 'contribute', 'whats-next'] as const).map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            {i > 0 && <span className="text-white/10">|</span>}
            <button
              onClick={() => toggle(id)}
              className={`px-2 py-1 rounded transition-colors relative group ${
                open === id ? 'text-[#00d4ff]' : 'text-muted-foreground/50 hover:text-[#00d4ff]'
              }`}
            >
              {id === 'built-by' ? 'Built By' : id === 'contribute' ? 'Contribute' : "What's Next?"}
              <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-px bg-[#00d4ff] transition-all duration-300 ${
                open === id ? 'w-4/5' : 'w-0 group-hover:w-4/5'
              }`} />
            </button>
          </span>
        ))}
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={close}
        >
          <div
            className="relative w-full max-w-md mx-4 rounded-xl overflow-hidden"
            style={{
              background: 'rgba(21,25,34,0.95)',
              backdropFilter: 'blur(10px)',
              border: '2px solid #00d4ff',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,212,255,0.05)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#00d4ff]/20"
              style={{ background: 'rgba(0,212,255,0.05)' }}>
              <h3 className="text-sm font-bold tracking-widest text-[#00d4ff] uppercase"
                style={{ fontFamily: 'var(--font-orbitron), sans-serif', textShadow: '0 0 20px rgba(0,212,255,0.8)' }}>
                {open === 'built-by' ? 'Built By' : open === 'contribute' ? 'Contribute' : "What's Next?"}
              </h3>
              <button onClick={close} className="text-muted-foreground/50 hover:text-[#00d4ff] transition-colors text-xl leading-none">×</button>
            </div>

            {/* Body */}
            <div className="px-6 py-6">
              {open === 'built-by' && <BuiltByPanel />}
              {open === 'contribute' && <ContributePanel />}
              {open === 'whats-next' && <WhatsNextPanel />}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#00d4ff]/10 flex justify-end"
              style={{ background: 'rgba(0,0,0,0.2)' }}>
              <button
                onClick={close}
                className="px-6 py-1.5 rounded border-2 border-[#00d4ff]/30 text-muted-foreground/60 text-xs font-mono hover:border-[#00d4ff] hover:text-[#00d4ff] transition-all hover:-translate-y-px"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BuiltByPanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#00d4ff]/40 flex items-center justify-center text-[#00d4ff] font-bold shrink-0"
          style={{ background: 'rgba(0,212,255,0.08)' }}>
          GK
        </div>
        <div>
          <p className="font-semibold text-foreground">Giorgi Kobaidze</p>
          <p className="text-xs text-muted-foreground">Principal Software Engineer</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground/70 leading-relaxed">
        Built for the DEV × Notion MCP Challenge. I obsess over clean tools and sharp interfaces — NoteRunway is what I'd actually want in my own workflow.
      </p>
      <div className="flex items-center gap-4 pt-1">
        <SocialLink href="https://github.com/georgekobaidze" icon={<Github size={14} />} label="GitHub" />
        <SocialLink href="https://www.linkedin.com/in/giorgikobaidze/" icon={<Linkedin size={14} />} label="LinkedIn" />
        <SocialLink href="https://x.com/georgekobaidze" icon={<Twitter size={14} />} label="X" />
        <SocialLink href="https://dev.to/georgekobaidze" icon={<BookOpen size={14} />} label="DEV" />
      </div>
    </div>
  )
}

function ContributePanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground/70 leading-relaxed">
        NoteRunway is open source. PRs, issues, and ideas are all welcome.
      </p>
      <div className="flex flex-col gap-2">
        <ContributeLink
          href="https://github.com/georgekobaidze/noterunway"
          icon={<Github size={14} />}
          label="Star & fork on GitHub"
          sub="Browse the source code"
        />
        <ContributeLink
          href="https://dev.to/georgekobaidze"
          icon={<BookOpen size={14} />}
          label="Follow on DEV"
          sub="Read the submission post"
        />
        <ContributeLink
          href="https://x.com/georgekobaidze"
          icon={<Twitter size={14} />}
          label="Reach out on X"
          sub="Feature requests, feedback"
        />
      </div>
    </div>
  )
}

function WhatsNextPanel() {
  const items = [
    'Markdown rendering in Semantic Ask chat',
    'Execute results fed back to AI conversation context',
    'New Chat button to reset conversation',
    'Notion OAuth (connect without integration token)',
    'Mobile-friendly layout',
    'Scheduled workspace health reports',
    'Export scan results to CSV / PDF',
  ]
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground/70 leading-relaxed">Planned for after the challenge deadline:</p>
      <div className="flex flex-col gap-2.5">
        {items.map(item => (
          <div key={item} className="flex items-start gap-3 text-sm text-muted-foreground/60">
            <span className="text-[#00d4ff]/40 shrink-0 mt-px font-mono">◦</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-[#00d4ff] transition-colors">
      {icon} {label}
    </a>
  )
}

function ContributeLink({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/5 hover:border-[#00d4ff]/40 transition-all group"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span className="text-muted-foreground/50 group-hover:text-[#00d4ff] transition-colors shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-medium text-foreground/80 group-hover:text-[#00d4ff] transition-colors">{label}</p>
        <p className="text-xs text-muted-foreground/40 mt-0.5">{sub}</p>
      </div>
    </a>
  )
}
