import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, Search, User } from 'lucide-react'
import { LogoTile } from '../components/Logo'

const TILES = [
  { Icon: Bell, title: 'Updates', text: 'What changed at companies you follow.' },
  { Icon: Search, title: 'Research', text: 'Evidence-based company research.' },
  { Icon: User, title: 'Profile', text: 'Your account and preferences.' },
]

function Wave({ flip = false }) {
  return (
    <svg viewBox="0 0 430 120" preserveAspectRatio="none" className={`absolute left-0 w-full ${flip ? 'bottom-0 h-[110px]' : 'top-0 h-[120px] rotate-180'}`} aria-hidden>
      <path d="M0,70 C110,20 220,120 430,40 L430,120 L0,120 Z" fill="#CFF0DF" opacity="0.55" />
      <path d="M0,95 C140,50 260,125 430,70 L430,120 L0,120 Z" fill={flip ? '#33C486' : '#E2F6EC'} opacity={flip ? 0.85 : 0.9} />
      {flip && <path d="M0,110 C150,80 280,130 430,95 L430,120 L0,120 Z" fill="#0D9367" opacity="0.9" />}
    </svg>
  )
}

export default function Splash() {
  const nav = useNavigate()
  return (
    <div className="relative flex h-full flex-col overflow-y-auto no-scrollbar bg-surface">
      <Wave />
      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pt-14 text-center">
        <LogoTile size={104} className="drop-shadow-lg" />
        <h1 className="mt-4 text-[64px] font-black leading-none tracking-tight text-[#0B4A35]">FINN</h1>
        <p className="mt-3 text-[11px] font-bold tracking-[0.2em] whitespace-nowrap text-navy">FINANCIAL INVESTMENT INTELLIGENCE</p>
        <div className="mt-5 h-1.5 w-14 rounded-full bg-[#2FD08A]" />
        <h2 className="mt-5 text-[25px] font-extrabold leading-[1.18] text-navy">
          Intelligence That Drives Informed Investment Decisions.
        </h2>
        <p className="mt-3 max-w-[330px] text-[15px] leading-relaxed text-slate2">
          Portfolio intelligence, evidence-based company research, and management accountability.
        </p>

        <div className="mt-7 grid w-full grid-cols-3 divide-x divide-line">
          {TILES.map(({ Icon, title, text }) => (
            <div key={title} className="flex flex-col items-center px-1.5">
              <div className="grid h-14 w-16 place-items-center rounded-2xl bg-mint text-forest">
                <Icon size={26} strokeWidth={1.9} />
              </div>
              <div className="mt-2.5 text-[15px] font-extrabold text-navy">{title}</div>
              <div className="mt-1 text-[12px] leading-snug text-slate2">{text}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto w-full pb-[118px] pt-8">
          <button onClick={() => nav('/updates')} className="btn-primary h-14 w-full text-[17px] shadow-[0_10px_24px_rgba(13,147,103,0.35)]">
            Explore FINN <ArrowRight size={20} />
          </button>
          <p className="mt-3 text-[12px] text-slate2">No sign-up needed · Guest mode · FINN v0.2.0</p>
        </div>
      </div>
      <Wave flip />
    </div>
  )
}
