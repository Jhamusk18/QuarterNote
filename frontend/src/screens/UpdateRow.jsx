import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, MessageSquare, BarChart3, UserRound, Layers, Gavel, Coins, Megaphone, CalendarDays, Vote, Lock,
  Factory, TrendingUp, TrendingDown, Activity, FileText, Star, Users, Split, Handshake, Landmark,
} from 'lucide-react'
import { stamp, timeAgo } from '../lib/format'

export const EVENT_ICONS = {
  results: BarChart3, management_change: UserRound, 'M&A': Handshake, fund_raise: Layers, litigation: Gavel, dividend: Coins,
  press_release: Megaphone, investor_meetings: Users, earnings_call: MessageSquare, agm_egm: CalendarDays, postal_ballot: Vote,
  pledging: Lock, capex: Factory, credit_rating: Star, bonus_split: Split, insider_trading: Landmark, unclassified: FileText,
  volume_surge: Activity,
}
export function eventIcon(it) {
  if (it.category === 'price_movement') return (it.details?.change_pct ?? 0) >= 0 ? TrendingUp : TrendingDown
  return EVENT_ICONS[it.category] || FileText
}

const BAR = { high: 'before:bg-hi-bar', medium: 'before:bg-md-bar', routine: 'before:bg-rt-bar' }
const PRI_TXT = { high: ['High', 'text-hi-fg'], medium: ['Medium', 'text-md-fg'], routine: ['Routine', 'text-rt-fg'] }

export function timeLabel(it) {
  return it.kind === 'market' ? `Session ${it.details?.session_date || stamp(it.datetime)}` : `Filed ${stamp(it.datetime)}`
}

export default function UpdateRow({ it, onOpen, dense = false }) {
  const nav = useNavigate()
  const Icon = eventIcon(it)
  const [pri, priCls] = PRI_TXT[it.priority] || PRI_TXT.routine
  const open = () => { onOpen?.(); nav(`/updates/${encodeURIComponent(it.id)}`) }
  return (
    <button type="button" onClick={open} aria-label={`${it.company}: ${it.headline || it.title}. ${pri} priority. Open update`}
      className={`card relative block w-full overflow-hidden pl-4 pr-2.5 text-left transition active:scale-[.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald ${dense ? 'py-2' : 'py-2.5'} before:absolute before:inset-y-0 before:left-0 before:w-[4px] ${BAR[it.priority]}`}>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold">
            <span className="truncate rounded-full bg-[#E3F1EA] px-2 py-[1px] text-forest">{it.symbol}</span>
            <span className="truncate text-slate2">{it.category_label}</span>
            <span className="text-[#B7C2BE]" aria-hidden>·</span>
            <span className={priCls}>{pri}</span>
            {it.simulated && <span className="rounded-full bg-[#FFF1E6] px-1.5 text-[#B54708]">Simulated</span>}
            {it.historical && <span className="rounded-full bg-[#E8F1FF] px-1.5 text-[#1D4ED8]">Historical example</span>}
          </div>
          <h3 className={`mt-0.5 font-bold leading-snug text-navy ${dense ? 'line-clamp-1 text-[14px]' : 'line-clamp-2 text-[15px]'}`}>{it.headline || it.title}</h3>
          {!dense && it.why && <p className="mt-0.5 line-clamp-1 text-[12px] text-slate2"><span className="font-semibold text-navy/80">Why flagged:</span> {it.why}</p>}
          <p className="mt-0.5 text-[11.5px] text-slate2">{timeLabel(it)}{it.kind !== 'market' ? ` IST · ${timeAgo(it.datetime)}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!dense && <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint text-emerald"><Icon size={18} /></span>}
          <ChevronRight size={18} className="text-slate2" aria-hidden />
        </div>
      </div>
    </button>
  )
}
