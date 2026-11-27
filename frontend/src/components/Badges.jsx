import { stamp } from '../lib/format'

export function ModeBadge({ mode, asOf, compact = false }) {
  const m = (mode || '').toUpperCase()
  const styles = {
    EOD: 'bg-mint text-forest border-[#BFE6D0]',
    LIVE: 'bg-[#E8F1FF] text-[#1D4ED8] border-[#BFD3FA]',
    SIMULATED: 'bg-[#FFF1E6] text-[#B54708] border-[#F9C99B]',
  }
  return (
    <span className={`pill border ${styles[m] || styles.EOD}`} title={asOf ? `As of ${stamp(asOf)} IST` : ''}>
      <span className={`h-1.5 w-1.5 rounded-full ${m === 'LIVE' ? 'bg-[#1D4ED8] animate-pulsedot' : m === 'SIMULATED' ? 'bg-[#B54708]' : 'bg-emerald'}`} />
      {m === 'SIMULATED' ? 'Simulated' : m}
      {!compact && asOf ? <span className="font-medium opacity-80">· {stamp(asOf)}</span> : null}
    </span>
  )
}

export function DataModePill({ mode }) {
  const map = {
    LIVE_FEEDS: ['Live filings', 'bg-emerald'],
    PARTIAL: ['Filings · partial', 'bg-[#F2B01E]'],
    SIMULATED: ['Simulated data', 'bg-[#B54708]'],
    LOADING: ['Connecting…', 'bg-slate2 animate-pulsedot'],
  }
  const [label, dot] = map[mode] || map.LOADING
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-navy shadow-card">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const PRI = {
  high: 'bg-hi-bg text-hi-fg',
  medium: 'bg-md-bg text-md-fg',
  routine: 'bg-rt-bg text-rt-fg',
}
export function PriorityChip({ p }) {
  return <span className={`pill ${PRI[p]}`}>{p === 'high' ? 'High' : p === 'medium' ? 'Medium' : 'Routine'}</span>
}
export function CategoryChip({ p, label }) {
  return <span className={`pill ${PRI[p]} !font-medium`}>{label}</span>
}
export function TickerChip({ s }) {
  return <span className="pill bg-[#E3F1EA] text-forest">{s}</span>
}
