import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Check, ChevronDown, ChevronUp } from 'lucide-react'
import Sheet from '../components/Sheet'
import { CATEGORIES, MARKET_SIGNALS, DEFAULT_FILTERS } from '../lib/store'
import { WINDOWS } from '../lib/filters'

function Opt({ on, children, onClick }) {
  return <button type="button" onClick={onClick} className={`chip-opt ${on ? 'chip-on' : 'chip-off'}`}>{children}</button>
}

function Box({ on, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 py-1 text-[14px] text-navy">
      <span className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border ${on ? 'border-emerald bg-emerald text-white' : 'border-[#B8C4BF] bg-surface'}`}>
        {on && <Check size={13} strokeWidth={3} />}
      </span>
      {label}
    </button>
  )
}

export default function FilterSheet({ open, onClose, applied, onApply, focus, companies, counts, thresholds, onEditThresholds }) {
  const [d, setD] = useState(applied)
  const [q, setQ] = useState('')
  const [allCats, setAllCats] = useState(false)
  const refs = { priority: useRef(null), companies: useRef(null), window: useRef(null), categories: useRef(null) }

  useEffect(() => {
    if (!open) return
    setD(applied) // fresh draft every time the sheet opens
    setQ('')
    setAllCats(applied.categories.some((c) => !CATEGORIES.slice(0, 6).some(([k]) => k === c)))
    if (focus && refs[focus]) setTimeout(() => refs[focus].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key, v) => setD((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }))
  const shown = useMemo(() => companies.filter((c) => !q || `${c.symbol} ${c.name}`.toLowerCase().includes(q.toLowerCase())), [companies, q])
  const cats = allCats ? CATEGORIES : CATEGORIES.slice(0, 6)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter updates"
      maxH="90%"
      right={<button className="text-[15px] font-semibold text-emerald" onClick={() => { onApply(DEFAULT_FILTERS); onClose() }}>Reset</button>}
      footer={
        <div className="flex gap-3">
          <button className="btn-ghost h-12 flex-[0.8] bg-surface" onClick={() => setD(DEFAULT_FILTERS)}>Clear all</button>
          <button className="btn-primary h-12 flex-[1.6] bg-[#0B8A5E]" onClick={() => { onApply(d); onClose() }}>Apply filters</button>
        </div>
      }
    >
      <div className="divide-y divide-line px-5">
        <section ref={refs.priority} className="scroll-mt-2 py-4">
          <div className="section-label">1. Priority</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[['all', 'All priorities'], ['high', 'High'], ['medium', 'Medium'], ['routine', 'Routine']].map(([k, l]) => (
              <Opt key={k} on={d.priority === k} onClick={() => setD({ ...d, priority: k })}>
                {l}{counts && k !== 'all' ? ` · ${counts[k]}` : ''}
              </Opt>
            ))}
          </div>
          {counts && <p className="mt-2 text-[11.5px] text-slate2">Counts use the current company, time and category filters.</p>}
        </section>

        <section ref={refs.companies} className="scroll-mt-2 py-4">
          <div className="section-label">2. Companies</div>
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-line bg-offwhite px-3 py-2.5">
            <Search size={18} className="text-slate2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies..." className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#8A97A3]" />
          </div>
          <div className="mt-3"><Box on={!d.companies.length} label="All portfolio companies" onClick={() => setD({ ...d, companies: [] })} /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {shown.map((c) => (
              <Opt key={c.symbol} on={d.companies.includes(c.symbol)} onClick={() => toggle('companies', c.symbol)}>{c.symbol}</Opt>
            ))}
            {!shown.length && <p className="text-[13px] text-slate2">No portfolio company matches “{q}”.</p>}
          </div>
        </section>

        <section ref={refs.window} className="scroll-mt-2 py-4">
          <div className="section-label">3. Time window</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {WINDOWS.map(([k, l]) => <Opt key={k} on={d.window === k} onClick={() => setD({ ...d, window: k })}>{l}</Opt>)}
          </div>
          {d.window === 'custom' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-[12px] font-medium text-slate2">From
                <input type="date" max={d.to || today} value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-[14px] text-navy" />
              </label>
              <label className="text-[12px] font-medium text-slate2">To
                <input type="date" min={d.from} max={today} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-[14px] text-navy" />
              </label>
              <p className="col-span-2 text-[11.5px] text-slate2">QuarterNote keeps the last 30 days of filings.</p>
            </div>
          )}
        </section>

        <section ref={refs.categories} className="scroll-mt-2 py-4">
          <div className="section-label">4. Categories</div>
          <div className="mt-3 text-[11px] font-bold tracking-wider text-slate2">MARKET SIGNALS</div>
          <div className="mt-1.5 grid grid-cols-2">
            {MARKET_SIGNALS.map(([k, l]) => <Box key={k} on={d.categories.includes(k)} label={l} onClick={() => toggle('categories', k)} />)}
          </div>
          <div className="mt-4 text-[11px] font-bold tracking-wider text-slate2">CORPORATE ANNOUNCEMENTS</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {cats.map(([k, l]) => <Opt key={k} on={d.categories.includes(k)} onClick={() => toggle('categories', k)}>{l}</Opt>)}
          </div>
          <button onClick={() => setAllCats(!allCats)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-emerald">
            {allCats ? <>Show fewer <ChevronUp size={15} /></> : <>Show all 17 categories <ChevronDown size={15} /></>}
          </button>
        </section>

        {onEditThresholds && thresholds && (
          <section className="py-4">
            <div className="section-label">5. Price &amp; volume alerts</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[13.5px] text-navy">Alert when volume is ≥{thresholds.volume_multiple}× the 20-day average or price moves ±{thresholds.price_move_pct}%.</p>
              <button type="button" onClick={onEditThresholds} className="btn-ghost h-9 shrink-0 px-3 text-[13px]">Edit thresholds</button>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  )
}
