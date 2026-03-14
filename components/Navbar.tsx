import Image from 'next/image'
import Link from 'next/link'

interface NavbarProps {
  rightSlot?: React.ReactNode
}

export function Navbar({ rightSlot }: NavbarProps) {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/images/logo.png" alt="NoteRunway" width={64} height={64} priority />
        <span className="neon-text font-mono font-bold text-lg tracking-tight">NoteRunway</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#00d4ff]/30 text-[#00d4ff]/70 tracking-widest">BETA</span>
      </Link>
      {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
    </nav>
  )
}
