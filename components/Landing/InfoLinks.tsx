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
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }

  const closePanel = () => {
    setVisible(false)
    setTimeout(() => {
      setOpen(null)
      document.body.style.overflow = ''
    }, 300)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <>
      {/* Nav links */}
      <nav className="flex items-center gap-3">
        {(['built-by', 'contribute', 'whats-next'] as Panel[]).map((id) => (
          <button
            key={id}
            onClick={() => openPanel(id)}
            className="group flex items-center gap-0 text-xs cursor-pointer select-none"
            style={{ fontFamily: 'var(--font-orbitron, Orbitron, sans-serif)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
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
              maxWidth: '52rem',
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
                style={{ color: '#00d4ff', textShadow: '0 0 16px rgba(0,212,255,0.7)', fontFamily: 'var(--font-orbitron, Orbitron, sans-serif)' }}
              >
                {LABELS[open]}
              </h2>
              <button
                onClick={closePanel}
                className="text-2xl leading-none cursor-pointer transition-colors duration-150"
                style={{ color: 'rgba(255,255,255,0.8)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#00d4ff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                aria-label="Close"
              >
                &#215;
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-6">
              {open === 'built-by'   && <BuiltByContent onWhatsNext={() => { closePanel(); setTimeout(() => openPanel('whats-next'), 350) }} />}
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

function BuiltByContent({ onWhatsNext }: { onWhatsNext: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 0' }}>

      {/* Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
          border: '3px solid #00d4ff',
          boxShadow: '0 0 20px rgba(0,212,255,0.5)',
          overflow: 'hidden',
        }}>
          <img src="/images/author-real.jpeg" alt="Giorgi Kobaidze" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-orbitron, monospace)', fontSize: '1.25rem', color: '#00d4ff', textShadow: '0 0 10px rgba(0,212,255,0.5)', letterSpacing: 1 }}>
            Giorgi Kobaidze
          </h2>
          <p style={{ margin: 0, fontSize: '1rem', color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
            Principal Software Engineer
          </p>
        </div>
      </div>

      {/* About Me */}
      <Section title="About Me">
        <BlockText>
          Passionate about a few things and all-in on every one of them. I build with the same care I brew coffee: strong and clean. Always aiming to be the main pilot in what I do, never just a passenger.
        </BlockText>
      </Section>

      {/* Connect */}
      <Section title="Connect">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          <SocialBtn href="https://github.com/georgekobaidze"            icon={<Github   size={15} />} label="GitHub"     />
          <SocialBtn href="https://www.linkedin.com/in/giorgikobaidze/"  icon={<Linkedin size={15} />} label="LinkedIn"   />
          <SocialBtn href="https://x.com/georgekobaidze"                 icon={<Twitter  size={15} />} label="X / Twitter"/>
          <SocialBtn href="https://dev.to/georgekobaidze"                icon={<BookOpen size={15} />} label="DEV.to"     />
        </div>
      </Section>

      {/* Project Purpose */}
      <Section title="Project Purpose">
        <BlockText>
          I've been a Notion user for years. It's where I think, plan, and build. So when I saw the DEV × Notion MCP Challenge, I didn't hesitate for a second, this was exactly the kind of problem I'd been wanting to solve for myself.
        </BlockText>
        <BlockText>
          Every Notion workspace gets messy over time. Duplicates pile up, links go dead, sensitive tokens slip into pages you forgot about. I wanted a tool that would actually do something about it, not just surface the problems, but let AI work through them while I stay in control. That's NoteRunway.
        </BlockText>
        <BlockText>
          Notion has genuinely changed the way I organize my life and work, it's one of those rare tools that just clicks right away. Building NoteRunway felt like my chance to give something back to a platform that's given me so much.
        </BlockText>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
          And that's not all!{' '}
          <button
            onClick={() => onWhatsNext()}
            style={{ color: '#00d4ff', textDecoration: 'underline', textUnderlineOffset: 3, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', fontStyle: 'inherit', padding: 0 }}
          >
            There are more features planned for the future.
          </button>
        </p>
      </Section>

      {/* Privacy */}
      <Section title="Privacy & Data">
        <BlockText>
          NoteRunway never stores your Notion data. Your integration token is kept in an httpOnly cookie and used only to make API calls on your behalf. No page content, no tokens, no analytics — nothing is persisted server-side.
        </BlockText>
        <BlockText>
          All AI processing happens in-memory per request. Your AI provider key is stored locally in your browser and is never sent to NoteRunway's servers.
        </BlockText>
      </Section>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <h3 style={{
        margin: 0, padding: '0 0 0.4rem 0',
        fontFamily: 'var(--font-orbitron, monospace)',
        fontSize: '0.85rem', color: '#00d4ff',
        textTransform: 'uppercase', letterSpacing: '1px',
        borderBottom: '2px solid rgba(0,212,255,0.3)',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function BlockText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: 0, padding: '0.5rem 0.75rem',
      background: 'rgba(0,212,255,0.05)',
      borderLeft: '3px solid #00d4ff',
      borderRadius: '0 4px 4px 0',
      fontSize: '1rem', lineHeight: 1.7,
      color: 'rgba(255,255,255,0.9)',
    }}>
      {children}
    </p>
  )
}

function SocialBtn({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
      style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(255,255,255,0.9)' }}
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
        el.style.color = 'rgba(255,255,255,0.9)'
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
