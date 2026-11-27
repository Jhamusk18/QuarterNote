import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, SlidersHorizontal, Settings2, ChevronDown, ChevronRight, ArrowRight, Sparkles, ShieldCheck, Building2,
  Bell, BarChart3, UserRound, AlertTriangle, RefreshCw, Zap, X, Inbox,
} from 'lucide-react'
import { BrandRow } from '../components/Logo'
import { DataModePill, ModeBadge } from '../components/Badges'
import Sparkline from '../components/Sparkline'
import FilterSheet from './FilterSheet'
import FeedCard, { RoutineRow } from './FeedCard'
import { api } from '../lib/api'
import { useApp } from '../lib/ctx'
import { DEFAULT_FILTERS, useLocal } from '../lib/store'
import { applyFilters, isDefault, labels } from '../lib/filters'
import { stamp, num2, pct } from '../lib/format'

const PCARDS = [
  ['high', 'HIGH', 'bg-hi-bg border-hi-bd text-hi-fg'],
  ['medium', 'MEDIUM', 'bg-md-bg border-md-bd text-md-fg'],
  ['routine', 'ROUTINE', 'bg-rt-bg border-rt-bd text-rt-fg'],
]

export default function Home() {
  const { thresholds, followedSet, portfolio, companies, setThresholdsOpen, prefs } = useApp()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [market, setMarket] = useState(null)
  const [filters, setFilters] = useLocal('filters', DEFAULT_FILTERS)
  const [sheet, setSheet] = useState({ open: false, focus: null })
  const [showAll, setShowAll] = useState(false)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true); setErr(null)
    api.digest(thresholds).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.market().then(setMarket).catch(() => setMarket({ tiles: [], error: true })) }, [])
  useEffect(() => { setShowAll(false); setRoutineOpen(filters.priority === 'routine') }, [filters])

  const items = data?.items || []
  const opts = { followed: portfolio.length ? followedSet : null, text }
  const base = useMemo(() => applyFilters(items, filters, { ...opts, ignorePriority: true }), [items, filters, followedSet, text]) // eslint-disable-line
  const counts = { high: 0, medium: 0, routine: 0 }
  base.forEach((i) => { counts[i.priority]++ })
  const visible = filters.priority === 'all' ? base : base.filter((i) => i.priority === filters.priority)
  const material = visible.filter((i) => i.priority !== 'routine')
  const routine = visible.filter((i) => i.priority === 'routine')
  const alerts = visible.filter((i) => i.alert)
  const shownMaterial = showAll ? material : material.slice(0, 5)
  const L = labels(filters)
  const active = !isDefault(filters)
  const openSheet = (focus = null) => setSheet({ open: true, focus })

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <header className="bg-gradient-to-b from-[#E4F4EC] to-offwhite px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <BrandRow right={<DataModePill mode={loading && !data ? 'LOADING' : data?.data_mode} />} />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-navy whitespace-nowrap">Today’s Intelligence</h1>
            <p className="text-[14px] text-slate2">What changed across your portfolio and the market?</p>
            <p className="mt-0.5 text-[12.5px] text-slate2">Last updated: {data ? stamp(data.generated_at) : '…'}{loading && data ? ' · refreshing' : ''}</p>
          </div>
          <div className="flex shrink-0 gap-2 pt-1">
            <button aria-label="Search feed" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setText('') }} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-card">
              {searchOpen ? <X size={19} /> : <Search size={19} />}
            </button>
            <button aria-label="Filters" onClick={() => openSheet()} className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-card">
              <SlidersHorizontal size={19} />
              {active && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald" />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 animate-fadein">
            <Search size={17} className="text-slate2" />
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search filings, companies, categories…" className="w-full bg-transparent text-[14px] outline-none" />
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {PCARDS.map(([k, label, cls]) => {
            const on = filters.priority === k
            return (
              <button key={k} onClick={() => setFilters({ ...filters, priority: on ? 'all' : k })}
                className={`rounded-2xl border py-2.5 text-center transition ${cls} ${on ? 'ring-2 ring-offset-1 ring-current' : ''} ${filters.priority !== 'all' && !on ? 'opacity-55' : ''}`}>
                <div className="text-[30px] font-extrabold leading-none tnum">{data ? counts[k] : '–'}</div>
                <div className="mt-1 text-[12px] font-semibold tracking-wide text-[#142B3A]">{label}</div>
              </button>
            )
          })}
        </div>

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
          {[['priority', L.priority, filters.priority !== 'all'], ['companies', L.companies, filters.companies.length > 0],
            ['window', L.window, filters.window !== '24h'], ['categories', L.categories, filters.categories.length > 0]].map(([k, l, on]) => (
            <button key={k} onClick={() => openSheet(k)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-semibold ${on || k === 'priority' ? 'border-emerald text-navy' : 'border-line text-navy'} ${on ? 'bg-mint' : 'bg-surface'}`}>
              {k === 'priority' && <SlidersHorizontal size={14} className="text-emerald" />}{l}<ChevronDown size={15} className="text-slate2" />
            </button>
          ))}
        </div>
      </header>

      <main className="space-y-3 px-3 pb-6">
        {err && (
          <div className="card flex items-center gap-3 p-3 text-[13px] text-hi-fg">
            <AlertTriangle size={18} /> Couldn’t load the digest: {err}
            <button onClick={load} className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald"><RefreshCw size={14} />Retry</button>
          </div>
        )}
        {data?.data_mode === 'SIMULATED' && (
          <div className="rounded-xl border border-[#F9C99B] bg-[#FFF6EE] p-3 text-[12.5px] text-[#9A3E06]">
            Live filing feeds are unavailable, so the items below are <b>SIMULATED demo data</b>. They are not real announcements.
          </div>
        )}

        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-2 text-[13px] text-slate2">
            {alerts.length > 0
              ? <span className="inline-flex items-center gap-1 font-semibold text-[#C2410C]"><Zap size={14} />{alerts.length} triggered alert{alerts.length > 1 ? 's' : ''}</span>
              : <span>{visible.length} update{visible.length === 1 ? '' : 's'}</span>}
            <span className="text-[#B7C2BE]">·</span>
            <span>Vol ≥{thresholds.volume_multiple}× · Price ±{thresholds.price_move_pct}%</span>
          </div>
          <button onClick={() => setThresholdsOpen(true)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-emerald">
            <Settings2 size={14} /> Thresholds
          </button>
        </div>

        {!data && loading && [0, 1, 2].map((i) => <div key={i} className="card h-[132px] animate-pulse bg-surface" />)}

        {data && !visible.length && (
          <div className="card flex flex-col items-center px-6 py-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint text-emerald"><Inbox size={24} /></div>
            <h3 className="mt-3 text-[16px] font-bold text-navy">Nothing matches these filters</h3>
            <p className="mt-1 text-[13px] text-slate2">No filings or alerts in {L.window.toLowerCase()} for this selection. That’s good news, or try a wider window.</p>
            <div className="mt-4 flex gap-2">
              {filters.window !== '7d' && <button className="btn-ghost h-9 px-3 text-[13px]" onClick={() => setFilters({ ...filters, window: '7d' })}>Widen to 7 days</button>}
              {active && <button className="btn-primary h-9 px-3 text-[13px]" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>}
            </div>
          </div>
        )}

        {shownMaterial.map((it) => <FeedCard key={it.id} it={it} compact={prefs.density === 'compact'} />)}

        {material.length > 5 && (
          <button onClick={() => setShowAll(!showAll)} className="flex w-full items-center justify-center gap-2 py-1.5 text-[16px] font-bold text-emerald">
            {showAll ? 'Show fewer' : `View all ${visible.length} updates`} <ArrowRight size={18} className={showAll ? '-rotate-90' : ''} />
          </button>
        )}
        {material.length <= 5 && material.length > 0 && routine.length > 0 && !routineOpen && (
          <button onClick={() => { setRoutineOpen(true) }} className="flex w-full items-center justify-center gap-2 py-1 text-[15px] font-bold text-emerald">
            View all {visible.length} updates <ArrowRight size={18} />
          </button>
        )}

        {routine.length > 0 && (
          <div className="card overflow-hidden">
            <button onClick={() => setRoutineOpen(!routineOpen)} className="flex w-full items-center gap-3 px-3.5 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-rt-bg text-rt-fg"><Inbox size={16} /></span>
              <span className="flex-1 text-left">
                <span className="block text-[14px] font-bold text-navy">{routine.length} routine update{routine.length > 1 ? 's' : ''}</span>
                <span className="block text-[12px] text-slate2">Compliance filings, meeting schedules, unclassified paperwork</span>
              </span>
              <ChevronRight size={18} className={`text-slate2 transition ${routineOpen ? 'rotate-90' : ''}`} />
            </button>
            {routineOpen && <div className="divide-y divide-line border-t border-line">{routine.map((it) => <RoutineRow key={it.id} it={it} />)}</div>}
          </div>
        )}

        <AskCard companies={companies} alerts={alerts.length ? alerts : material} />
        <MarketGlance market={market} />
        <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-slate2">
          Filings: {data ? [...new Set(Object.values(data.feeds || {}))].join(', ') || '—' : '…'} · Prices: Yahoo Finance EOD.
          Not investment advice.
        </p>
      </main>

      <FilterSheet open={sheet.open} focus={sheet.focus} onClose={() => setSheet({ open: false, focus: null })}
        applied={filters} onApply={setFilters} companies={portfolio.filter((c) => followedSet.has(c.symbol))} />
    </div>
  )
}

const SUGGEST = [
  [Bell, "Explain today's alert"], [BarChart3, 'Compare latest results'], [UserRound, 'Check management guidance'], [ShieldCheck, 'Identify financial risks'],
]

function AskCard({ companies, alerts }) {
  const nav = useNavigate()
  const [sym, setSym] = useState('')
  const [q, setQ] = useState('')
  const all = [...companies.portfolio, ...companies.adhoc]
  const go = (question) => {
    let s = sym
    let qq = question ?? q
    if (!s && qq === "Explain today's alert" && alerts[0]) s = alerts[0].symbol
    if (qq === "Explain today's alert" && alerts.find((a) => a.symbol === s)) qq = `Explain this development and why it matters: "${alerts.find((a) => a.symbol === s).title}"`
    if (qq === 'Check management guidance') qq = 'GUIDANCE'
    nav('/research', { state: { symbol: s || 'INFY', name: all.find((c) => c.symbol === (s || 'INFY'))?.name, question: qq } })
  }
  return (
    <section className="card p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mint text-emerald"><Sparkles size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[18px] font-extrabold text-navy">Ask QuarterNote for the Evidence</h3>
            <span className="pill shrink-0 bg-mint text-forest"><ShieldCheck size={12} />Evidence-backed</span>
          </div>
          <p className="text-[12.5px] text-slate2">Research with primary sources (annual reports, results, earnings calls)</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2.5">
        <label className="text-[13px] font-semibold text-navy">Company
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <Building2 size={17} className="text-slate2" />
            <select value={sym} onChange={(e) => setSym(e.target.value)} className="h-11 w-full bg-transparent text-[14px] text-navy outline-none">
              <option value="">Select a company</option>
              <optgroup label="Portfolio">{companies.portfolio.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol} · {c.name}</option>)}</optgroup>
              <optgroup label="Research ideas">{companies.adhoc.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol} · {c.name}</option>)}</optgroup>
            </select>
          </div>
        </label>
        <label className="text-[13px] font-semibold text-navy">Your question
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="e.g. What has management guided on growth and margins?"
            className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2.5 text-[14px] font-normal outline-none focus:border-emerald" />
        </label>
      </div>
      <div className="mt-2 text-[13px] font-semibold text-navy">Try a question</div>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {SUGGEST.map(([Icon, label]) => (
          <button key={label} onClick={() => go(label)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-offwhite px-3 py-2 text-[12.5px] font-medium text-navy">
            <Icon size={15} className="text-emerald" />{label}
          </button>
        ))}
      </div>
      <button onClick={() => go()} className="btn-primary mt-3 h-12 w-full bg-forest text-[16px]">
        <Search size={18} /> Investigate in Research <ArrowRight size={18} />
      </button>
    </section>
  )
}

function MarketGlance({ market }) {
  const t0 = market?.tiles?.find((t) => !t.error)
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[19px] font-extrabold text-navy">Market at a Glance</h3>
        {t0 && <ModeBadge mode={t0.mode} asOf={t0.as_of} />}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(market?.tiles || [0, 1, 2]).map((t, i) => (
          <div key={t.symbol || i} className="rounded-xl border border-line p-2.5">
            {t.label ? (
              <>
                <div className="text-[12px] font-semibold text-navy">{t.label}</div>
                {t.error ? <div className="mt-2 text-[11px] text-slate2">Unavailable</div> : (
                  <>
                    <div className="text-[17px] font-extrabold text-navy tnum">{num2(t.value)}</div>
                    <div className={`text-[13px] font-bold tnum ${t.change_pct >= 0 ? 'text-emerald' : 'text-hi-fg'}`}>{pct(t.change_pct, 2)}</div>
                    <div className="mt-1"><Sparkline data={t.spark} w={92} h={28} up={t.change_pct >= 0} /></div>
                  </>
                )}
              </>
            ) : <div className="h-[92px] animate-pulse rounded bg-offwhite" />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate2">{t0 ? `${t0.source} · 20-session sparkline · independent of feed filters` : market?.error ? 'Market data unavailable right now.' : 'Loading…'}</p>
    </section>
  )
}
