import type { ReactNode } from 'react'

interface FeatureCardProps {
  icon: ReactNode
  title: string
  description: string
  tag?: string
}

export function FeatureCard({ icon, title, description, tag }: FeatureCardProps) {
  return (
    <div className="glass-card rounded-xl p-6 flex flex-col gap-3 group hover:border-[#00d4ff]/40 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="text-[#00d4ff] text-2xl group-hover:drop-shadow-[0_0_8px_rgba(0,212,255,0.8)] transition-all duration-300">
          {icon}
        </div>
        {tag && (
          <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded-full border border-[#7b2fff]/40 text-[#7b2fff]">
            {tag}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-foreground text-base">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  )
}
