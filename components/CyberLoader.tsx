'use client'

interface CyberLoaderProps {
  className?: string
}

export function CyberLoader({ className = '' }: CyberLoaderProps) {
  return (
    <div
      className={`relative overflow-hidden rounded ${className}`}
      style={{ width: '5rem', height: '2.5rem' }}
      aria-label="Loading"
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)',
          backgroundSize: '10px 10px',
        }}
      />
      {/* Scanning line */}
      <div
        className="absolute left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
          boxShadow: '0 0 8px 2px rgba(0,212,255,0.7)',
          animation: 'cyber-scan 1.2s ease-in-out infinite',
        }}
      />
      {/* Corner brackets */}
      <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00d4ff]" />
      <span className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00d4ff]" />
      <span className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00d4ff]" />
      <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00d4ff]" />
    </div>
  )
}
