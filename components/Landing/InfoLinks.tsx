'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Github, Linkedin, Twitter, BookOpen } from 'lucide-react'

type Panel = 'built-by' | 'contribute' | 'whats-next'

const LABELS: Record<Panel, string> = {
  'built-by': 'Built By',
  'contribute': 'Contribute',
  'whats-next': "What's Next?",
}

export function InfoLinks() {
  const [open, setOpen] = useState<Panel | null>(null)
  const [visible, setVisible] = useState(false)

  const openPanel = (id: Panel) => {
    setOpen(id)
    // next tick so the element is mounted before the transition fires
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }

  const closePanel = () => {
    setVisible(false)
    setTimeout(() => setOpen(null), 300)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      {/* Nav links */}
      <nav className="flex items-center gap-3">
        {(['built-by', 'contribute', 'whats-next'] as Panel[]).map((id) => (
          <button
            key={id}
            onClick={() => openPanel(id)}
            className="group flex items-center gap-0 font-mono text-xs cursor-pointer select-none"
          >
            <span className="transition-all duration-200 text-[#00d4ff]/50 group-hover:text-[#00d4ff]">[</span>
            <span className="px-1.5 transition-all duration-200 text-[#00d4ff]/80 group-hover:text-[#00d4ff]" style={{ textShadow: undefined }}>
              {LABELS[id]}
            </span>
            <span className="transition-all duration-200 text-[#00d4ff]/50 group-hover:text-[#00d4ff]">]</span>
          </button>
        ))}
      </nav>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
          onClick={closePanel}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '32rem',
              margin: '0 1rem',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '85vh',
              background: '#0d1117',
              border: '2px solid #00d4ff',
              boxShadow: '0 0 40px rgba(0,212,255,0.15), 0 24px 48px rgba(0,0,0,0.8)',
              transform: visible ? 'scale(1)' : 'scale(0.9)',
              transition: 'transform 0.3s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ background: 'rgba(0,212,255,0.06)', borderBottom: '1px solid rgba(0,212,255,0.2)' }}
            >
              <h2
                className="text-sm font-bold tracking-widest uppercase"
                style={{ color: '#00d4ff', textShadow: '0 0 16px rgba(0,212,255,0.7)', fontFamily: 'monospace' }}
              >
                {LABELS[open]}
              </h2>
              <button
                onClick={closePanel}
                className="text-2xl leading-none cursor-pointer transition-colors duration-150"
                style={{ color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#00d4ff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                aria-label="Close"
              >
                &#215;
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-6">
              {open === 'built-by'   && <BuiltByContent />}
              {open === 'contribute' && <ContributeContent />}
              {open === 'whats-next' && <WhatsNextContent />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/* ── Panel contents ─────────────────────────────────────────── */

function BuiltByContent() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-base font-bold shrink-0"
          style={{ background: 'rgba(0,212,255,0.1)', border: '2px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
        >
          GK
        </div>
        <div>
          <p className="font-semibold text-white text-base">Giorgi Kobaidze</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Principal Software Engineer</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        Built for the <span style={{ color: '#00d4ff' }}>DEV × Notion MCP Challenge</span>. I obsess over clean tools and sharp interfaces — NoteRunway is what I'd actually want in my own workflow.
      </p>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.25rem' }}>
        <p className="text-xs font-mono mb-4" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>FIND ME ONLINE</p>
        <div className="flex flex-wrap gap-3">
          <SocialBtn href="https://github.com/georgekobaidze"         icon={<Github   size={15} />} label="GitHub"   />
          <SocialBtn href="https://www.linkedin.com/in/giorgikobaidze/" icon={<Linkedin size={15} />} label="LinkedIn" />
          <SocialBtn href="https://x.com/georgekobaidze"              icon={<Twitter  size={15} />} label="X / Twitter" />
          <SocialBtn href="https://dev.to/georgekobaidze"             icon={<BookOpen size={15} />} label="DEV.to"  />
        </div>
      </div>
    </div>
  )
}

function ContributeContent() {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        NoteRunway is open source. All contributions — PRs, issues, ideas, feedback — are welcome.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <ContributeCard
          href="https://github.com/georgekobaidze/noterunway"
          icon={<Github size={20} />}
          title="GitHub"
          sub="Star, fork, or open a PR"
        />
        <ContributeCard
          href="https://dev.to/georgekobaidze"
          icon={<BookOpen size={20} />}
          title="DEV.to"
          sub="Read the submission article"
        />
        <ContributeCard
          href="https://x.com/georgekobaidze"
          icon={<Twitter size={20} />}
          title="X / Twitter"
          sub="Share ideas & feedback"
        />
        <ContributeCard
          href="https://www.linkedin.com/in/giorgikobaidze/"
          icon={<Linkedin size={20} />}
          title="LinkedIn"
          sub="Connect professionally"
        />
      </div>
    </div>
  )
}

function WhatsNextContent() {
  const items = [
    'Markdown rendering in Semantic Ask chat responses',
    'AI conversation context updated with execute results',
    'New Chat button to reset conversation',
    'Notion OAuth — connect without an integration token',
    'Mobile-friendly responsive layout',
    'Scheduled workspace health digest emails',
    'Export scan results to CSV / PDF',
    'Plugin system for custom workspace rules',
  ]

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        Planned improvements after the challenge deadline:
      </p>
      <ul className="flex flex-col gap-3">
        {items.map(item => (
          <li key={item} className="flex items-start gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <span className="shrink-0 mt-0.5" style={{ color: '#00d4ff' }}>◦</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Shared sub-components ───────────────────────────────────── */

function SocialBtn({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
      style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(255,255,255,0.55)' }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.background = 'rgba(0,212,255,0.15)'
        el.style.borderColor = '#00d4ff'
        el.style.color = '#00d4ff'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = 'rgba(0,212,255,0.06)'
        el.style.borderColor = 'rgba(0,212,255,0.2)'
        el.style.color = 'rgba(255,255,255,0.55)'
      }}
    >
      {icon} {label}
    </a>
  )
}

function ContributeCard({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2 p-4 rounded-lg transition-all duration-150 cursor-pointer group"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.background = 'rgba(0,212,255,0.08)'
        el.style.borderColor = 'rgba(0,212,255,0.5)'
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 6px 20px rgba(0,212,255,0.15)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = 'rgba(255,255,255,0.03)'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
    >
      <span style={{ color: '#00d4ff' }}>{icon}</span>
      <div>
        <p className="font-semibold text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
      </div>
    </a>
  )
}
