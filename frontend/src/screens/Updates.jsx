import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, SlidersHorizontal, ChevronDown, ChevronRight, ArrowRight, Sparkles, ShieldCheck, Building2,
  Bell, BarChart3, UserRound, AlertTriangle, RefreshCw, X, Inbox,
} from 'lucide-react'
import { BrandRow } from '../components/Logo'
import { DataModePill, ModeBadge } from '../components/Badges'
import Sparkline from '../components/Sparkline'
import FilterSheet from './FilterSheet'
import UpdateRow from './UpdateRow'
import { api } from '../lib/api'
import { useApp } from '../lib/ctx'
import { DEFAULT_FILTERS, useLocal } from '../lib/store'
import { applyFilters, isDefault, labels } from '../lib/filters'
import { stamp, num2, pct } from '../lib/format'

export const DISCLAIMER = 'Summaries are automated. Always check the filing. Not investment advice.'
const PAGE = 12

export default function Updates() {
  const { followedSet, portfolio, companies, setThresholdsOpen, thresholds, digest, reloadDigest, updatesScroll } = useApp()
  const { data, err, loading } = digest
  const [market, setMarket] = useState(null)
  const [filters, setFilters] = useLocal('filters', DEFAULT_FILTERS)
  const [sheet, setSheet] = useState({ open: false, focus: null })
  const [showAll, setShowAll] = useLocal('updates:showAll', false)
  const [routineOpen, setRoutineOpen] = useLocal('updates:routineOpen', false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [text, setText] = useState('')
  const scroller = useRef(null)
  const firstFilters = useRef(true)

  useEffect(() => { api.market().then(setMarket).catch(() => setMarket({ tiles: [], error: true })) }, [])
  useEffect(() => {
    if (firstFilters.current) { firstFilters.current = false; return }
    setShowAll(false); setRoutineOpen(filters.priority === 'routine')
  }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || []
  const opts = { followed: portfolio.length ? followedSet : null, text }
  const base = useMemo(() => applyFilters(items, filters, { ...opts, ignorePriority: true }), [items, filters, followedSet, text]) // eslint-disable-line
  const counts = { high: 0, medium: 0, routine: 0 }
  base.forEach((i) => { counts[i.priority]++ })
  const visible = filters.priority === 'all' ? base : base.filter((i) => i.priority === filters.priority)
  const material = visible.filter((i) => i.priority !== 'routine')
  const routine = visible.filter((i) => i.priority === 'routine')
  const shownMaterial = showAll ? material : material.slice(0, PAGE)
  const L = labels(filters)
  const active = !isDefault(filters)
  const openSheet = (focus = null) => setSheet({ open: true, focus })
  const following = portfolio.length ? followedSet.size : 0

  // Restore the reader's place once the list for the saved filters is rendered.
  useLayoutEffect(() => {
    if (data && scroller.current && updatesScroll.current) scroller.current.scrollTop = updatesScroll.current
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const remember = () => { updatesScroll.current = scroller.current?.scrollTop || 0 }

  return (
    <div ref={scroller} onScroll={remember} className="h-full overflow-y-auto no-scrollbar" data-testid="updates-scroller">
      <header className="bg-gradient-to-b from-[#E4F4EC] to-offwhite px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <BrandRow right={<DataModePill mode={loading && !data ? 'LOADING' : data?.data_mode} />} />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-navy">Company updates</h1>
            <p className="text-[13.5px] text-slate2">Material disclosures from companies you follow.</p>
          </div>
          <div className="flex shrink-0 gap-2 pt-1">
            <button aria-label={searchOpen ? 'Close search' : 'Search updates'} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setText('') }} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-card">
              {searchOpen ? <X size={19} /> : <Search size={19} />}
            </button>
            <button aria-label="Filters, priority and thresholds" onClick={() => openSheet()} className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-card">
              <SlidersHorizontal size={19} />
              {active && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald" />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 animate-fadein">
            <Search size={17} className="text-slate2" />
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search updates, companies, event types…" aria-label="Search updates" className="w-full bg-transparent text-[14px] outline-none" />
          </div>
        )}

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
          <button onClick={() => openSheet('companies')} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald px-3.5 py-2 text-[13.5px] font-semibold text-navy ${filters.companies.length ? 'bg-mint' : 'bg-surface'}`}>
            {filters.companies.length ? L.companies : `Following · ${following}`}<ChevronDown size={15} className="text-slate2" />
          </button>
          <button onClick={() => openSheet('window')} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-semibold text-navy ${filters.window !== '24h' ? 'border-emerald bg-mint' : 'border-line bg-surface'}`}>
            {L.window}<ChevronDown size={15} className="text-slate2" />
          </button>
          {filters.priority !== 'all' && (
            <button onClick={() => openSheet('priority')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald bg-mint px-3.5 py-2 text-[13.5px] font-semibold text-navy">
              {L.priority}<ChevronDown size={15} className="text-slate2" />
            </button>
          )}
          {filters.categories.length > 0 && (
            <button onClick={() => openSheet('categories')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald bg-mint px-3.5 py-2 text-[13.5px] font-semibold text-navy">
              {L.categories}<ChevronDown size={15} className="text-slate2" />
            </button>
          )}
        </div>
        <div className="pb-2 text-[12px] leading-snug text-slate2">
          <span>FINN refreshed {data ? `${stamp(data.generated_at)} IST` : '…'}{loading && data ? ' · refreshing' : ''}</span>
          <span className="block">{DISCLAIMER}</span>
        </div>
      </header>

      <main className="space-y-2 px-3 pb-6">
        {err && (
          <div className="card flex items-center gap-3 p-3 text-[13px] text-hi-fg">
            <AlertTriangle size={18} /> Couldn’t load updates: {err}
            <button onClick={() => reloadDigest()} className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald"><RefreshCw size={14} />Retry</button>
          </div>
        )}
        {data?.data_mode === 'SIMULATED' && (
          <div className="rounded-xl border border-[#F9C99B] bg-[#FFF6EE] p-3 text-[12.5px] text-[#9A3E06]">
            Live filing feeds are unavailable, so the items below are <b>SIMULATED demo data</b>. They are not real announcements.
          </div>
        )}

        {data && visible.length > 0 && (
          <p className="px-1 text-[12.5px] text-slate2">
            {visible.length} update{visible.length === 1 ? '' : 's'}
            {filters.priority === 'all' && <> · <span className="font-semibold text-hi-fg">{counts.high} high</span> · <span className="font-semibold text-md-fg">{counts.medium} medium</span> · {counts.routine} routine</>}
          </p>
        )}

        {!data && loading && [0, 1, 2, 3].map((i) => <div key={i} className="card h-[92px] animate-pulse bg-surface" />)}

        {data && !visible.length && (
          <div className="card flex flex-col items-center px-6 py-7 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint text-emerald"><Inbox size={24} /></div>
            <h3 className="mt-3 text-[16px] font-bold text-navy">No matching updates</h3>
            <p className="mt-1 text-[13px] text-slate2">Nothing from the companies you follow in {L.window.toLowerCase()} for this selection.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {filters.window !== '7d' && filters.window !== '30d' && <button className="btn-ghost h-9 px-3 text-[13px]" onClick={() => setFilters({ ...filters, window: '7d' })}>Widen to 7 days</button>}
              {filters.window !== '30d' && <button className="btn-ghost h-9 px-3 text-[13px]" onClick={() => setFilters({ ...filters, window: '30d' })}>Widen to 30 days</button>}
              {active && <button className="btn-primary h-9 px-3 text-[13px]" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>}
            </div>
          </div>
        )}
        {data && !visible.length && <HistoricalExamples onOpen={remember} />}

        {shownMaterial.map((it) => <UpdateRow key={it.id} it={it} onOpen={remember} />)}

        {material.length > PAGE && (
          <button onClick={() => setShowAll(!showAll)} className="flex w-full items-center justify-center gap-2 py-1.5 text-[15px] font-bold text-emerald">
            {showAll ? 'Show fewer' : `Show all ${material.length} material updates`} <ArrowRight size={17} className={showAll ? '-rotate-90' : ''} />
          </button>
        )}

        {routine.length > 0 && (
          <div className="card overflow-hidden">
            <button onClick={() => setRoutineOpen(!routineOpen)} aria-expanded={routineOpen} className="flex w-full items-center gap-3 px-3.5 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-rt-bg text-rt-fg"><Inbox size={16} /></span>
              <span className="flex-1 text-left">
                <span className="block text-[14px] font-bold text-navy">{routine.length} routine update{routine.length > 1 ? 's' : ''}</span>
                <span className="block text-[12px] text-slate2">Compliance filings, meeting schedules, unclassified paperwork</span>
              </span>
              <ChevronRight size={18} className={`text-slate2 transition ${routineOpen ? 'rotate-90' : ''}`} />
            </button>
            {routineOpen && <div className="space-y-1.5 border-t border-line bg-offwhite p-2">{routine.map((it) => <UpdateRow key={it.id} it={it} dense onOpen={remember} />)}</div>}
          </div>
        )}

        <AskCard companies={companies} alerts={material} />
        <MarketGlance market={market} />
        <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-slate2">
          Filings: {data ? [...new Set(Object.values(data.feeds || {}))].join(', ') || '—' : '…'} · Prices: Yahoo Finance EOD ·
          Alerts at Vol ≥{thresholds.volume_multiple}× · Price ±{thresholds.price_move_pct}%.
        </p>
      </main>

      <FilterSheet open={sheet.open} focus={sheet.focus} onClose={() => setSheet({ open: false, focus: null })}
        applied={filters} onApply={setFilters} companies={portfolio.filter((c) => followedSet.has(c.symbol))}
        counts={counts} thresholds={thresholds} onEditThresholds={() => { setSheet({ open: false, focus: null }); setThresholdsOpen(true) }} />
    </div>
  )
}

const SUGGEST = [
  [Bell, "Explain today's alert"], [BarChart3, 'Compare latest results'], [UserRound, 'Check management guidance'], [ShieldCheck, 'Identify financial risks'],
]

function HistoricalExamples({ onOpen }) {
  const [s, setS] = useState(null)
  if (!s) {
    return (
      <button className="w-full py-1 text-center text-[13px] font-semibold text-emerald underline underline-offset-2"
        onClick={() => { setS({ loading: true }); api.historical().then((r) => setS({ items: r.items })).catch((e) => setS({ err: e.message })) }}>
        See a historical example
      </button>
    )
  }
  if (s.loading) return <p className="text-center text-[12.5px] text-slate2">Loading…</p>
  if (s.err) return <p className="text-center text-[12.5px] text-slate2">Historical examples unavailable: {s.err}</p>
  return (
    <section aria-label="Historical examples" className="space-y-2">
      <h3 className="px-1 pt-1 text-[14px] font-extrabold text-navy">Historical examples</h3>
      <p className="px-1 text-[12px] text-slate2">Older filings FINN has checked by hand against the original PDF. They are not new.</p>
      {s.items.map((it) => <UpdateRow key={it.id} it={it} onOpen={onOpen} />)}
    </section>
  )
}

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
            <h3 className="text-[18px] font-extrabold text-navy">Ask FINN for the Evidence</h3>
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
