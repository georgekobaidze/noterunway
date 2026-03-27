'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen } from 'lucide-react'

type Panel = 'built-by' | 'contribute' | 'whats-next'

const LABELS: Record<Panel, string> = {
  'built-by': 'Built By',
  'contribute': 'Contribute',
  'whats-next': "What's Next?",
}

export function InfoLinks() {
  const [open, setOpen] = useState<Panel | null>(null)
  const [visible, setVisible] = useState(false)
  const [highlightConnect, setHighlightConnect] = useState(false)

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

  const switchTo = (target: Panel, highlight = false) => {
    closePanel()
    setTimeout(() => {
      openPanel(target)
      if (target === 'built-by' && highlight) {
        // wait for fade-in to finish before highlighting
        setTimeout(() => setHighlightConnect(true), 400)
      }
    }, 350)
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
              {open === 'built-by'   && <BuiltByContent highlightConnect={highlightConnect} onHighlightDone={() => setHighlightConnect(false)} onWhatsNext={() => switchTo('whats-next')} />}
              {open === 'contribute' && <ContributeContent onSocialLinks={() => switchTo('built-by', true)} />}
              {open === 'whats-next' && <WhatsNextContent onSocialLinks={() => switchTo('built-by', true)} onContribute={() => switchTo('contribute')} />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/* ── Panel contents ─────────────────────────────────────────── */

function BuiltByContent({ onWhatsNext, highlightConnect, onHighlightDone }: { onWhatsNext: () => void; highlightConnect: boolean; onHighlightDone: () => void }) {
  useEffect(() => {
    if (highlightConnect) {
      const timer = setTimeout(onHighlightDone, 2000)
      return () => clearTimeout(timer)
    }
  }, [highlightConnect])
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
      <div style={{
        padding: '0.5rem',
        borderRadius: '6px',
        transition: 'background 0.5s ease, box-shadow 0.5s ease',
        ...(highlightConnect ? {
          background: 'rgba(0,212,255,0.08)',
          boxShadow: '0 0 0 2px rgba(0,212,255,0.4)',
        } : {}),
      }}>
        <Section title="Connect">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
            <SocialBtn href="https://github.com/georgekobaidze"            icon={<GithubIcon />}   label="GitHub"     />
            <SocialBtn href="https://www.linkedin.com/in/giorgikobaidze/"  icon={<LinkedinIcon />} label="LinkedIn"   />
            <SocialBtn href="https://x.com/georgekobaidze"                 icon={<TwitterIcon />}  label="X / Twitter"/>
            <SocialBtn href="https://dev.to/georgekobaidze"                icon={<BookOpen size={15} />} label="DEV.to"     />
            <SocialBtn href="https://discord.gg/sjUuC8McVn"                icon={<DiscordIcon />}  label="Discord"    />
          </div>
        </Section>
      </div>

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
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
          And that's not all!{' '}
          <button
            onClick={() => onWhatsNext()}
            style={{ color: '#00d4ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00ff88'; e.currentTarget.style.textShadow = '0 0 10px rgba(0,255,136,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.textShadow = '' }}
          >
            There are more features planned for the future.
          </button>
        </p>
      </Section>

      {/* Privacy */}
      <Section title="Privacy & Data">
        <BlockText>
          NoteRunway does not store your Notion page content or your Notion OAuth access token in any database. The <code>notion_token</code> issued by Notion's OAuth flow is kept in an httpOnly cookie and used only to make Notion API calls on your behalf during your session.
        </BlockText>
        <BlockText>
          All AI processing happens per request. Your AI provider key is stored locally in your browser and is sent to NoteRunway's servers with each request (for example, via a request header) so we can call your AI provider on your behalf, but it is not persisted in our databases.
        </BlockText>
      </Section>

    </div>
  )
}

function ContributeContent({ onSocialLinks }: { onSocialLinks: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        NoteRunway is open source. All contributions (PRs, issues, ideas, feedback) are welcome.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <ContributeCard
          href="https://discord.gg/sjUuC8McVn"
          icon={<DiscordIcon />}
          title="Discord"
          sub="Join the community"
        />
        <ContributeCard
          href="https://github.com/georgekobaidze/noterunway"
          icon={<GithubIcon />}
          title="GitHub"
          sub="Star, fork, or open a PR"
        />
        <ContributeCard
          href="https://www.youtube.com/@Pilotronica"
          icon={<YoutubeIcon />}
          title="YouTube"
          sub="Watch demos & tutorials"
        />
        <ContributeCard
          href="https://dev.to/georgekobaidze"
          icon={<BookOpen size={20} />}
          title="DEV.to"
          sub="Read the submission article"
        />
      </div>

      <p style={{ margin: 0, fontSize: '1rem', color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
        Or connect with me through my{' '}
        <button
          onClick={onSocialLinks}
          style={{ color: '#00d4ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#00ff88'; e.currentTarget.style.textShadow = '0 0 10px rgba(0,255,136,0.6)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.textShadow = '' }}
        >
          social channels
        </button>.
      </p>
    </div>
  )
}

function WhatsNextContent({ onSocialLinks, onContribute }: { onSocialLinks: () => void; onContribute: () => void }) {
  const items = [
    'New Chat: reset the Semantic Ask conversation and start fresh without a page reload',
    'Export scan results to CSV or PDF for sharing, auditing, or archiving',
    'Mobile app: full NoteRunway experience on iOS and Android',
    'Desktop app: native client for macOS and Windows with offline support',
    'Voice chat: talk to your workspace instead of typing',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>

      {/* Intro badge */}
      <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.25rem 1rem',
          background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,212,255,0.2))',
          border: '2px solid #00ff88',
          borderRadius: '6px',
          color: '#00ff88',
          fontFamily: 'var(--font-orbitron, monospace)',
          fontWeight: 700,
          fontSize: '0.7rem',
          letterSpacing: '2px',
          textShadow: '0 0 10px rgba(0,255,136,0.6)',
          boxShadow: '0 0 12px rgba(0,255,136,0.3)',
        }}>
          BETA
        </span>
        <p style={{ margin: '0.6rem 0 0 0', fontSize: '1rem', color: 'rgba(255,255,255,0.75)' }}>
          This is the base functionality. More features are coming soon!
        </p>
      </div>

      {/* Roadmap list */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {items.map(item => (
          <RoadmapItem key={item}>{item}</RoadmapItem>
        ))}
      </ul>

      {/* CTA */}
      <div style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <p style={{ margin: 0, fontSize: '1rem', color: 'rgba(255,255,255,0.75)' }}>
          Have a cool idea or feedback? Reach out via my{' '}
          <button onClick={onSocialLinks} style={{ color: '#00d4ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00ff88'; e.currentTarget.style.textShadow = '0 0 10px rgba(0,255,136,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.textShadow = '' }}>
            social links
          </button>!
        </p>
        <p style={{ margin: 0, fontSize: '1rem', color: 'rgba(255,255,255,0.75)' }}>
          Or{' '}
          <button onClick={onContribute} style={{ color: '#00d4ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00ff88'; e.currentTarget.style.textShadow = '0 0 10px rgba(0,255,136,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.textShadow = '' }}>
            join the community
          </button>{' '}
          and help shape the future of NoteRunway.
        </p>
      </div>

    </div>
  )
}

function RoadmapItem({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '0.5rem 1rem 0.5rem 2rem',
        background: hovered ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.05)',
        borderLeft: `3px solid ${hovered ? '#00ff88' : '#00d4ff'}`,
        borderRadius: '0 4px 4px 0',
        fontSize: '1rem',
        lineHeight: 1.6,
        color: 'rgba(255,255,255,0.9)',
        transform: hovered ? 'translateX(5px)' : 'translateX(0)',
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}
    >
      <span style={{
        position: 'absolute',
        left: '0.5rem',
        color: hovered ? '#00ff88' : '#00d4ff',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateX(3px)' : 'translateX(0)',
      }}>▸</span>
      {children}
    </li>
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

function GithubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )
}

function LinkedinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
    </svg>
  )
}

function TwitterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

function YoutubeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
    </svg>
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

