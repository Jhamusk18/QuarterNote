import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, MessageSquare, BarChart3, UserRound, Layers, Gavel, Coins, Megaphone, CalendarDays, Vote, Lock,
  Factory, TrendingUp, TrendingDown, Activity, FileText, ExternalLink, Zap, Star, Users, Split, Handshake, Landmark, ChevronUp,
} from 'lucide-react'
import { CategoryChip, PriorityChip, TickerChip, ModeBadge } from '../components/Badges'
import { crore, pct, timeAgo, stamp, inr, num2 } from '../lib/format'

const ICONS = {
  results: BarChart3, management_change: UserRound, 'M&A': Handshake, fund_raise: Layers, litigation: Gavel, dividend: Coins,
  press_release: Megaphone, investor_meetings: Users, earnings_call: MessageSquare, agm_egm: CalendarDays, postal_ballot: Vote,
  pledging: Lock, capex: Factory, credit_rating: Star, bonus_split: Split, insider_trading: Landmark, unclassified: FileText,
  volume_surge: Activity,
}
const BAR = { high: 'before:bg-hi-bar', medium: 'before:bg-md-bar', routine: 'before:bg-rt-bar' }

function headline(it) {
  const d = it.details
  if (d?.type === 'results' && d.metrics?.length) {
    const pat = d.metrics.find((m) => m.metric === 'PAT')
    const rev = d.metrics.find((m) => m.metric === 'Revenue')
    const bits = []
    if (pat?.yoy != null) bits.push(`profit ${pct(pat.yoy, 0)} YoY`)
    if (rev?.yoy != null) bits.push(`revenue ${pct(rev.yoy, 0)}`)
    return `${d.quarter} results: ${bits.join(', ') || 'filed'}`
  }
  if (d?.type === 'management' && d.name) return `${d.role ? `${d.role}: ` : ''}${d.name}`
  return it.title
}

function subline(it) {
  const d = it.details
  if (d?.type === 'results' && d.metrics?.length) {
    const rev = d.metrics.find((m) => m.metric === 'Revenue')
    const pat = d.metrics.find((m) => m.metric === 'PAT')
    return `Revenue ${crore(rev?.value)} (${pct(rev?.yoy, 0)} YoY) · PAT ${crore(pat?.value)} (${pct(pat?.yoy, 0)} YoY)`
  }
  if (d?.type === 'management' && d.background && d.status === 'ok') return d.background
  return it.summary || null
}

function ResultsTable({ d }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between bg-offwhite px-3 py-2 text-[11.5px] text-slate2">
        <span className="font-semibold text-navy">{d.quarter} · {d.basis} · {d.unit}</span>
        <span>QoQ vs prev quarter · YoY vs same quarter LY</span>
      </div>
      <table className="w-full text-[13px] tnum">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate2">
            <th className="px-3 py-1.5 font-semibold">Metric</th><th className="px-2 py-1.5 text-right font-semibold">Value</th>
            <th className="px-2 py-1.5 text-right font-semibold">QoQ</th><th className="px-3 py-1.5 text-right font-semibold">YoY</th>
          </tr>
        </thead>
        <tbody>
          {d.metrics.map((m) => (
            <tr key={m.metric} className="border-t border-line">
              <td className="px-3 py-2 font-semibold text-navy">
                {m.metric}{m.metric === 'EBITDA' && m.value != null && <span className="ml-1 rounded bg-offwhite px-1 text-[10px] font-semibold text-slate2">derived</span>}
              </td>
              <td className="px-2 py-2 text-right">{m.value == null ? <span className="text-[11.5px] text-slate2">{m.note || 'n/a'}</span> : inr(m.value)}</td>
              <Delta v={m.qoq} /><Delta v={m.yoy} last />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line px-3 py-2 text-[11px] leading-snug text-slate2">
        Numbers: {d.numbers_source}. {d.metrics.find((m) => m.metric === 'EBITDA')?.note}
      </div>
    </div>
  )
}
const Delta = ({ v, last }) => (
  <td className={`${last ? 'px-3' : 'px-2'} py-2 text-right font-semibold ${v == null ? 'text-slate2' : v >= 0 ? 'text-emerald' : 'text-hi-fg'}`}>{pct(v)}</td>
)

function MgmtBlock({ d }) {
  if (d.status === 'ok' || d.status === 'excerpt') {
    return (
      <div className="mt-3 rounded-xl border border-line bg-offwhite p-3">
        {d.name && <div className="text-[14px] font-bold text-navy">{d.name}{d.role && <span className="font-medium text-slate2"> · {d.role}</span>}</div>}
        {d.effective_date && <div className="text-[12px] text-slate2">Effective {d.effective_date}</div>}
        <p className="mt-1.5 text-[13px] leading-relaxed text-navy">{d.background}</p>
        <p className="mt-2 text-[11px] text-slate2">
          Background source: {d.source}{d.page ? `, p.${d.page}` : ''} · {d.method}
          {d.source_url && <a href={d.source_url} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-emerald">open ↗</a>}
        </p>
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-[12.5px] text-slate2">
      {d.note || (d.status === 'error' ? 'Could not read the filing to verify the appointee’s background.' : 'No verifiable background found in the filing — FINN does not guess.')}
    </div>
  )
}

function MarketBlock({ d }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-line bg-offwhite p-3 text-[12px] tnum">
      <div><div className="text-slate2">Close</div><div className="font-bold text-navy">₹{num2(d.close)}</div></div>
      <div><div className="text-slate2">Change</div><div className={`font-bold ${d.change_pct >= 0 ? 'text-emerald' : 'text-hi-fg'}`}>{pct(d.change_pct, 2)}</div></div>
      <div><div className="text-slate2">Vol / 20D avg</div><div className="font-bold text-navy">{d.volume_multiple ?? '—'}×</div></div>
      <div className="col-span-3 flex items-center justify-between pt-1 text-[11px] text-slate2">
        <span>Session {d.session_date} · {d.source}</span><ModeBadge mode="EOD" asOf={d.as_of} compact />
      </div>
    </div>
  )
}

export default function FeedCard({ it, compact = false }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const Icon = it.category === 'price_movement' ? ((it.details?.change_pct ?? 0) >= 0 ? TrendingUp : TrendingDown) : (ICONS[it.category] || FileText)
  const sub = subline(it)
  const investigate = () => nav('/research', {
    state: {
      symbol: it.symbol, name: it.company,
      question: it.category === 'results' ? `What drove the ${it.details?.quarter || 'latest'} results, and how do they compare with management guidance?`
        : it.category === 'management_change' ? `What has management said about leadership and strategy continuity?`
          : `Explain this development and its likely financial impact: "${it.title}"`,
    },
  })
  return (
    <article className={`card relative overflow-hidden pl-4 pr-3.5 ${compact ? 'py-2.5' : 'py-3'} before:absolute before:inset-y-0 before:left-0 before:w-[5px] ${BAR[it.priority]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TickerChip s={it.symbol} />
          <CategoryChip p={it.priority} label={it.category_label} />
          <PriorityChip p={it.priority} />
          {it.alert && <span className="pill bg-[#FFE9E3] text-[#C2410C]"><Zap size={11} />Alert</span>}
          {it.simulated && <span className="pill bg-[#FFF1E6] text-[#B54708]">Simulated</span>}
          {it.kind === 'market' && <ModeBadge mode="EOD" compact />}
        </div>
        <span className="shrink-0 pt-0.5 text-[12px] text-slate2" title={stamp(it.datetime)}>{timeAgo(it.datetime)}</span>
      </div>
      <div className="mt-1.5 flex gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`text-[16px] font-bold leading-snug text-navy ${open ? "" : "line-clamp-2"}`}>{headline(it)}</h3>
          {sub && !(compact && !open) && <p className={`mt-0.5 text-[13.5px] leading-snug text-slate2 ${open ? '' : 'line-clamp-2'}`}>{sub}</p>}
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mint text-emerald"><Icon size={22} /></div>
      </div>

      {open && (
        <div className="animate-fadein">
          {it.details?.type === 'results' && it.details.metrics && <ResultsTable d={it.details} />}
          {it.details?.type === 'management' && <MgmtBlock d={it.details} />}
          {it.details?.type === 'market' && <MarketBlock d={it.details} />}
          {it.summary && it.details?.type !== 'market' && (
            <p className="mt-3 text-[13px] leading-relaxed text-navy">
              {it.summary}
              {it.summary_source && <span className="block pt-1 text-[11px] text-slate2">Summary: {it.summary_source}</span>}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate2">
            {it.url && it.url !== '#' && (
              <a href={it.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald">
                <FileText size={13} /> {it.kind === 'market' ? 'Price chart' : 'Original filing'} <ExternalLink size={12} />
              </a>
            )}
            <span>Filed {stamp(it.datetime)} IST · via {it.feed}</span>
            <span>Classified by {it.method === 'llm-fast' ? 'AI (fast model)' : it.method === 'threshold' ? 'your thresholds' : 'rules'}</span>
          </div>
          {it.kind === 'announcement' && it.title !== headline(it) && <p className="mt-1 text-[11.5px] text-slate2">Filing title: {it.title}</p>}
        </div>
      )}

      <div className={`${compact ? "mt-2" : "mt-3"} flex gap-2.5`}>
        <button onClick={investigate} className="btn-primary h-10 flex-[1.25] bg-[#21C27F] text-[15px] text-navy">
          Investigate <ArrowRight size={17} />
        </button>
        <button onClick={() => setOpen(!open)} className="btn-ghost h-10 flex-1 text-[15px]">
          {open ? <><ChevronUp size={17} /> Less</> : <><MessageSquare size={17} /> Summarise</>}
        </button>
      </div>
    </article>
  )
}

export function RoutineRow({ it }) {
  return (
    <a href={it.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3.5 py-2.5">
      <TickerChip s={it.symbol} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-navy">{it.title}</div>
        <div className="text-[11px] text-slate2">{it.category_label} · {timeAgo(it.datetime)}</div>
      </div>
      <ExternalLink size={14} className="shrink-0 text-slate2" />
    </a>
  )
}
