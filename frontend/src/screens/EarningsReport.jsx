import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Calculator, ChevronDown, ExternalLink, FileText, Loader2, MessageCircle, Pin, PinOff, Quote, TriangleAlert } from 'lucide-react'
import Sheet from '../components/Sheet'
import { api } from '../lib/api'
import { num2, stamp } from '../lib/format'
import { useLocal } from '../lib/store'

const IN2F = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const printed = (v) => (v == null ? '—' : IN2F.format(v))

const IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function fmtValue(v, unit) {
  if (v == null) return '—'
  if (unit === '%') return `${v.toFixed(1)}%`
  return `₹${Math.abs(v) < 100 ? num2(v) : IN.format(v)} cr`
}

export function ChangeChip({ c, size = 'md' }) {
  const sm = size === 'sm'
  if (!c) return null
  if (!c.comparable) {
    return <span className={`whitespace-nowrap rounded-full bg-[#EEF1F0] px-2 py-[2px] font-semibold text-slate2 ${sm ? 'text-[11px]' : 'text-[12px]'}`}>Cannot compare</span>
  }
  const up = c.value > 0, flat = c.value === 0
  const tone = flat ? 'bg-[#EEF1F0] text-slate2' : up ? 'bg-rt-bg text-rt-fg' : 'bg-hi-bg text-hi-fg'
  const unit = c.kind === 'pp' ? ' pp' : '%'
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-[2px] font-bold tabular-nums ${tone} ${sm ? 'text-[11px]' : 'text-[12px]'}`}
      aria-label={`${flat ? 'unchanged' : up ? 'up' : 'down'} ${Math.abs(c.value)}${c.kind === 'pp' ? ' percentage points' : ' percent'}`}>
      {flat ? '■' : up ? '▲' : '▼'} {Math.abs(c.value).toFixed(1)}{unit}
    </span>
  )
}

function StatusBadge({ status }) {
  if (status === 'verified') return <span className="inline-flex items-center gap-1 rounded-full bg-rt-bg px-2 py-[2px] text-[11.5px] font-bold text-rt-fg"><BadgeCheck size={13} />Verified against filing</span>
  if (status === 'calculated_from_verified') return <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F1FF] px-2 py-[2px] text-[11.5px] font-bold text-[#1D4ED8]"><Calculator size={13} />Calculated from verified rows</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-md-bg px-2 py-[2px] text-[11.5px] font-bold text-md-fg"><TriangleAlert size={13} />Not verified against filing</span>
}

function PageChip({ page, url }) {
  if (!page) return null
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-[1px] text-[11px] font-bold text-emerald">p.{page}<ExternalLink size={10} /></a>
    : <span className="shrink-0 rounded-md border border-line px-1.5 py-[1px] text-[11px] font-bold text-slate2">p.{page}</span>
}

function FilingRowSheet({ metric, e, cmp, onClose }) {
  const ev = metric.evidence
  const st = ev.statement
  const cols = ['cur', cmp]
  return (
    <Sheet open onClose={onClose} title="Filing row" maxH="90%"
      footer={st?.url
        ? <a href={st.url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald py-3 text-[15px] font-bold text-white"><FileText size={17} />Open PDF at p.{st.page}<ExternalLink size={15} /></a>
        : e.numbers_source && <a href={e.numbers_source.url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald py-3 text-[15px] font-bold text-emerald">Open screener.in table<ExternalLink size={15} /></a>}>
      <div className="space-y-3 px-5 py-4 text-[13.5px] text-navy">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[16px] font-extrabold">{metric.label}</span>
          <StatusBadge status={ev.status} />
        </div>
        {ev.status === 'not_verified' ? (
          <p className="rounded-xl bg-md-bg px-3 py-2 text-[13px] text-md-fg">{ev.note}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 rounded-xl border border-line bg-offwhite p-3 text-[12.5px]">
              <dt className="text-slate2">Statement</dt><dd>{st.title}</dd>
              <dt className="text-slate2">Page</dt><dd className="flex items-center gap-1.5">Page {st.page} <PageChip page={st.page} url={st.url} /></dd>
              <dt className="text-slate2">Units</dt><dd>{st.units_printed} (as printed)</dd>
              <dt className="text-slate2">Basis</dt><dd>{st.basis}</dd>
              {cols.map((c) => (<FragmentRow key={c} k={c === 'cur' ? 'This period' : 'Compared with'} v={`${st.columns[c].period} · “${st.columns[c].printed}”`} />))}
            </dl>
            {metric.formula && <p className="text-[12.5px]"><span className="font-bold">How QuarterNote calculates it:</span> {metric.formula}</p>}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[12.5px] tabular-nums">
                <caption className="sr-only">Rows as printed in the filing</caption>
                <thead className="bg-offwhite text-slate2">
                  <tr><th className="px-2 py-1.5 text-left font-semibold">Row as printed</th>{cols.map((c) => <th key={c} className="px-2 py-1.5 text-right font-semibold">{st.columns[c].period}</th>)}</tr>
                </thead>
                <tbody>
                  {ev.rows.map((r) => (
                    <tr key={r.label} className="border-t border-line align-top">
                      <td className="px-2 py-1.5"><span className="font-semibold">{r.label}</span><span className="block text-[11px] text-slate2">Line {r.line}{r.note ? ' · see note' : ''}</span></td>
                      {cols.map((c) => <td key={c} className="px-2 py-1.5 text-right">{printed(r.values[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ev.rows.filter((r) => r.note).map((r) => <p key={r.label} className="text-[12px] text-slate2">Note on {r.label}: {r.note}</p>)}
            {ev.note && <p className="text-[12.5px] text-slate2">{ev.note}</p>}
            {ev.company_note && (
              <blockquote className="rounded-xl border-l-4 border-md-bar bg-md-bg/60 px-3 py-2 text-[12.5px]">
                <div className="mb-1 flex items-center gap-2 font-bold">{ev.company_note.ref} <PageChip page={ev.company_note.page} url={ev.company_note.url} /></div>
                “{ev.company_note.excerpt}”
              </blockquote>
            )}
            {ev.third_party && (
              <div className="rounded-xl border border-line p-3 text-[12.5px]">
                <div className="font-bold">Cross-check with {ev.third_party.source}</div>
                <ul className="mt-1 space-y-0.5 tabular-nums">
                  {ev.third_party.checks.map((c) => (
                    <li key={c.period}>{c.period}: {IN.format(c.third_party_value)} vs filing {printed(c.filing_value)} — {c.matches ? 'matches within rounding' : 'does not match'}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function FragmentRow({ k, v }) {
  return <><dt className="text-slate2">{k}</dt><dd>{v}</dd></>
}

function MetricRow({ m, cmp, open, onToggle, onFiling, unit, tracking, onTrack }) {
  const ch = m.changes[cmp]
  const a = m.figures[cmp], b = m.figures.cur
  const u = m.key === 'margin' ? '%' : unit
  return (
    <li className={`overflow-hidden rounded-2xl border ${open ? 'border-emerald/40 bg-mint/40' : 'border-line bg-surface'}`}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-3 text-left">
        <span className="min-w-0 flex-1 text-[14px] font-bold leading-tight text-navy">{m.label}</span>
        <span className="text-right text-[13.5px] tabular-nums text-navy">
          <span className="text-slate2">{fmtValue(a.value, u)}</span> → <span className="font-bold">{fmtValue(b.value, u)}</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-slate2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="flex items-center gap-2 px-3 pb-2 -mt-1.5"><ChangeChip c={ch} size="sm" />
        {ch.comparable && !ch.like_for_like && <span className="text-[11px] text-slate2">reported, not like-for-like</span>}
      </div>
      {open && (
        <div className="space-y-2 border-t border-emerald/20 px-3 pb-3 pt-2 text-[13.5px] text-navy">
          {m.breakdown && cmp === 'yoy' && <p>{m.breakdown.text}</p>}
          {m.plain && <p>{m.plain}{ch.comparable && ch.kind === 'pp' ? ` That is ${Math.abs(ch.value).toFixed(1)} percentage points ${ch.value < 0 ? 'lower' : 'higher'}.` : ''}</p>}
          {!ch.comparable && <p className="rounded-xl bg-[#EEF1F0] px-3 py-2 text-[13px]"><span className="font-bold">Cannot compare:</span> {ch.reason}</p>}
          {m.formula && <p className="text-[12.5px] text-slate2">Formula: {m.formula}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <StatusBadge status={m.evidence.status} />
            <button onClick={onFiling} className="inline-flex items-center gap-1 text-[14px] font-bold text-emerald">View filing row →</button>
          </div>
          {onTrack && (
            <button onClick={onTrack} className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-[13.5px] font-bold ${tracking ? 'border-line text-slate2' : 'border-emerald text-emerald'}`}>
              {tracking ? <><PinOff size={15} />Stop tracking {m.label.toLowerCase()}</> : <><Pin size={15} />Track {m.label.toLowerCase()}</>}
            </button>
          )}
          {onTrack && !tracking && <p className="text-[11.5px] text-slate2">QuarterNote will show this figure next to the same metric in the next comparable release, with both sources.</p>}
        </div>
      )}
    </li>
  )
}

function TrackedCard({ it, t, onStop }) {
  const [r, setR] = useState(null)
  useEffect(() => {
    let alive = true
    api.track(it.id, t.metric, t.baseline_id).then((x) => alive && setR(x)).catch((e) => alive && setR({ state: 'unavailable', reason: e.message }))
    return () => { alive = false }
  }, [it.id, t.metric, t.baseline_id])
  if (!r || r.state === 'baseline') return null
  const side = (x, label) => x && (
    <div className="rounded-xl bg-surface p-2.5">
      <div className="text-[11px] font-semibold text-slate2">{label} · {x.figure.period}</div>
      <div className="text-[18px] font-extrabold tabular-nums text-navy">{fmtValue(x.figure.value, x.figure.unit)}</div>
      <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11.5px] font-bold text-emerald">Filing{x.page ? ` p.${x.page}` : ''}<ExternalLink size={11} /></a>
      <div className="text-[10.5px] text-slate2">Filed {stamp(x.filed)} IST</div>
    </div>
  )
  return (
    <section aria-label="Tracked metric" className="rounded-2xl border border-emerald/40 bg-mint/50 p-3">
      <div className="flex items-center gap-2">
        <Pin size={15} className="text-emerald" />
        <h3 className="flex-1 text-[14px] font-extrabold text-navy">Tracking {t.label.toLowerCase()}</h3>
        <button onClick={onStop} className="text-[12.5px] font-semibold text-slate2 underline">Stop tracking</button>
      </div>
      {r.state === 'unavailable' ? <p className="mt-1 text-[12.5px] text-slate2">{r.reason}</p> : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">{side(r.baseline, 'Baseline')}{side(r.latest, 'This release')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-navy">
            {r.change && <ChangeChip c={r.change} />}
            {r.state === 'ok' && <span>{r.change.from_period} → {r.change.to_period}{!r.change.like_for_like ? ' · reported, not like-for-like' : ''}</span>}
            {(r.state === 'cannot_compare' || r.state === 'older') && <span className="text-slate2">{r.reason || r.change?.reason}</span>}
          </div>
        </>
      )}
    </section>
  )
}

function ManagementSaid({ id }) {
  const [s, setS] = useState({ state: 'loading' })
  useEffect(() => {
    let alive = true, tries = 0, timer
    const go = () => api.management(id).then((r) => {
      if (!alive) return
      setS(r)
      if (r.state === 'preparing' && tries++ < 8) timer = setTimeout(go, 4000)
    }).catch((e) => alive && setS({ state: 'unavailable', reason: e.message }))
    go()
    return () => { alive = false; clearTimeout(timer) }
  }, [id])
  return (
    <section aria-label="What management said" className="card p-3">
      <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-navy"><Quote size={16} className="text-emerald" />What management said</h3>
      {s.state === 'loading' || s.state === 'preparing'
        ? <p className="mt-1 inline-flex items-center gap-2 text-[13px] text-slate2"><Loader2 size={14} className="animate-spin" />{s.state === 'preparing' ? `Preparing documents (${s.reason})…` : 'Checking transcripts…'}</p>
        : s.state === 'ok'
          ? (<div className="mt-2 space-y-2">
            {s.statements.map((st, i) => (
              <blockquote key={i} className="rounded-xl bg-offwhite px-3 py-2 text-[13px] text-navy">
                “{st.text}”
                <div className="mt-1 flex items-center gap-2 text-[11.5px] text-slate2">{st.source.section} <PageChip page={st.source.page} url={st.source.url} /></div>
              </blockquote>
            ))}
            <p className="text-[11.5px] text-slate2">{s.note}</p>
          </div>)
          : <p className="mt-1 rounded-xl bg-[#EEF1F0] px-3 py-2 text-[13px] text-slate2"><span className="font-bold text-navy">Evidence unavailable.</span> {s.reason}</p>}
    </section>
  )
}

export default function EarningsReport({ d }) {
  const e = d.earnings, it = d.item
  const nav = useNavigate()
  const [cmp, setCmp] = useState('yoy')
  const [open, setOpen] = useState(e.metrics.find((m) => m.breakdown)?.key || null)
  const [filing, setFiling] = useState(null)
  const [tracked, setTracked] = useLocal('tracked', [])
  const trackOf = (key) => tracked.find((t) => t.symbol === it.symbol && t.metric === key)
  const toggleTrack = (m) => {
    if (trackOf(m.key)) setTracked(tracked.filter((t) => !(t.symbol === it.symbol && t.metric === m.key)))
    else setTracked([...tracked, { symbol: it.symbol, metric: m.key, label: m.label, baseline_id: it.id, baseline_period: m.figures.cur.period,
      value: m.figures.cur.value, unit: m.figures.cur.unit, basis: m.figures.cur.basis, at: new Date().toISOString() }])
  }
  const carried = tracked.filter((t) => t.symbol === it.symbol && t.baseline_id !== it.id)
  const op = e.metrics.find((m) => m.key === 'op')
  const question = op && op.changes.yoy.comparable && op.changes.yoy.value < 0
    ? `What drove the rise in operating costs in ${e.periods.cur.period}?`
    : `What drove the change in operating profit in ${e.periods.cur.period}?`
  const verified = e.verification.status === 'manually_verified'
  const lfl = e.key_changes.some((k) => k.change.comparable && !k.change.like_for_like)
  const general = e.caveats.filter((c) => !/excise/i.test(c.text))
  const periodLine = `${e.periods[cmp].period} → ${e.periods.cur.period}`

  return (
    <>
      {e.headline && <p className="-mt-1 text-[12.5px] text-slate2">{e.headline_note}</p>}

      {!verified && (
        <p className="flex gap-2 rounded-xl border border-md-bd bg-md-bg px-3 py-2 text-[12.5px] text-md-fg">
          <TriangleAlert size={16} className="mt-[1px] shrink-0" />
          <span>Filing excerpt not verified. These numbers come from {e.numbers_source?.publisher || 'a third-party table'}; open the filing to check them.</span>
        </p>
      )}

      {carried.map((t) => <TrackedCard key={t.metric} it={it} t={t} onStop={() => setTracked(tracked.filter((x) => x !== t))} />)}

      <section aria-label="Key changes">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold text-navy">Key changes</h3>
          <span className="text-[11.5px] font-semibold text-slate2">{e.periods.yoy.period} → {e.periods.cur.period}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {e.key_changes.map((k) => (
            <div key={k.metric} className="rounded-2xl border border-line bg-surface p-2.5">
              <div className="text-[11.5px] font-semibold leading-tight text-slate2">{k.metric}</div>
              <div className="mt-1.5"><ChangeChip c={k.change} /></div>
              {k.change.comparable && <div className="mt-1 text-[10.5px] tabular-nums text-slate2">{fmtValue(k.change.from_value, k.change.kind === 'pp' ? '%' : e.unit)} → {fmtValue(k.change.to_value, k.change.kind === 'pp' ? '%' : e.unit)}</div>}
              {!k.change.comparable && <div className="mt-1 text-[10.5px] text-slate2">{k.change.reason}</div>}
            </div>
          ))}
        </div>
        {lfl && general.length > 0 && (
          <p className="mt-2 text-[12px] text-slate2">
            <span className="font-bold text-navy">Not like-for-like.</span> The company says acquisitions make this quarter not comparable with earlier periods ({general.map((c, i) => <span key={c.ref}>{i ? ', ' : ''}<a className="font-semibold text-emerald underline" href={c.url} target="_blank" rel="noreferrer">{c.ref}, p.{c.page}</a></span>)}).
          </p>
        )}
      </section>

      <section aria-label="Metrics">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-extrabold text-navy">Quarterly results</h3>
            <p className="text-[11.5px] text-slate2">{periodLine} · {e.basis} · {e.unit}</p>
          </div>
          <div role="radiogroup" aria-label="Compare with" className="flex rounded-full border border-line bg-surface p-0.5 text-[12px] font-bold">
            {[['yoy', 'Year ago'], ['qoq', 'Last quarter']].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={cmp === k} onClick={() => setCmp(k)}
                className={`rounded-full px-2.5 py-1 ${cmp === k ? 'bg-emerald text-white' : 'text-slate2'}`}>{l}</button>
            ))}
          </div>
        </div>
        <ul className="space-y-2">
          {e.metrics.map((m) => (
            <MetricRow key={m.key} m={m} cmp={cmp} unit={e.unit} open={open === m.key}
              tracking={!!trackOf(m.key)} onTrack={m.trackable && verified ? () => toggleTrack(m) : null}
              onToggle={() => setOpen(open === m.key ? null : m.key)} onFiling={() => setFiling(m)} />
          ))}
        </ul>
      </section>

      <ManagementSaid id={it.id} />

      <button onClick={() => nav('/research', { state: { symbol: it.symbol, name: it.company, period: e.periods.cur.period, question } })}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint text-emerald"><MessageCircle size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-navy">Ask a follow-up</span>
          <span className="block text-[12.5px] text-slate2">{question}</span>
        </span>
      </button>

      {filing && <FilingRowSheet metric={filing} e={e} cmp={cmp} onClose={() => setFiling(null)} />}
    </>
  )
}
