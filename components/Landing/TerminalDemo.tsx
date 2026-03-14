'use client'

import { useEffect, useState } from 'react'

const FRAMES = [
  { type: 'input', text: '> ask "Archive all meeting notes older than 3 months"' },
  { type: 'thinking', text: '  ⠋ Scanning workspace...' },
  { type: 'output', text: '  ✦ Found 47 pages matching criteria' },
  { type: 'output', text: '  ✦ Identified 3 clusters of related notes' },
  { type: 'output', text: '  ✦ Proposed actions:' },
  { type: 'action', text: '    [archive] Meeting Notes 2025-Q1  (32 pages)' },
  { type: 'action', text: '    [archive] Weekly Standup Oct–Dec  (11 pages)' },
  { type: 'action', text: '    [archive] Sprint Retros Q3        (4 pages)' },
  { type: 'prompt', text: '  Awaiting your approval... [confirm / skip]' },
]

const TYPE_SPEED = 28   // ms per character
const LINE_PAUSE = 350  // ms between lines
const RESTART_DELAY = 3500

export function TerminalDemo() {
  const [lines, setLines] = useState<{ type: string; text: string }[]>([])
  const [currentChar, setCurrentChar] = useState(0)
  const [lineIndex, setLineIndex] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => {
        setLines([])
        setCurrentChar(0)
        setLineIndex(0)
        setDone(false)
      }, RESTART_DELAY)
      return () => clearTimeout(t)
    }

    if (lineIndex >= FRAMES.length) {
      setDone(true)
      return
    }

    const currentLine = FRAMES[lineIndex]
    if (currentChar < currentLine.text.length) {
      const t = setTimeout(() => setCurrentChar((c) => c + 1), TYPE_SPEED)
      return () => clearTimeout(t)
    }

    // Line complete — pause then move to next
    const t = setTimeout(() => {
      setLines((prev) => [...prev, { type: currentLine.type, text: currentLine.text }])
      setCurrentChar(0)
      setLineIndex((i) => i + 1)
    }, LINE_PAUSE)
    return () => clearTimeout(t)
  }, [lineIndex, currentChar, done])

  const colorFor = (type: string) => {
    switch (type) {
      case 'input':    return 'text-[#00d4ff]'
      case 'thinking': return 'text-yellow-400'
      case 'output':   return 'text-emerald-400'
      case 'action':   return 'text-violet-400'
      case 'prompt':   return 'text-[#00d4ff] animate-pulse'
      default:         return 'text-zinc-300'
    }
  }

  const currentLine = lineIndex < FRAMES.length ? FRAMES[lineIndex] : null

  return (
    <div className="glass-card neon-border rounded-xl p-5 font-mono text-sm leading-6 w-full max-w-2xl text-left">
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
        <span className="w-3 h-3 rounded-full bg-red-500/70" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-xs text-zinc-500 tracking-widest uppercase" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>noterunway — ask</span>
      </div>

      {/* Fixed-height output — overflow hidden, no scrollbar */}
      <div className="h-56 overflow-hidden">
        {/* Completed lines */}
        {lines.map((line, i) => (
          <div key={i} className={colorFor(line.type)}>
            {line.text}
          </div>
        ))}

        {/* Currently typing line */}
        {!done && currentLine && (
          <div className={colorFor(currentLine.type)}>
            {currentLine.text.slice(0, currentChar)}
            <span className="animate-pulse">▋</span>
          </div>
        )}
      </div>
    </div>
  )
}
