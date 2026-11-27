import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { ComboChart, GrowthChart } from '../components/Charts'

// "Sep 2026" -> "Q2'27" (Indian fiscal year: Apr–Mar)
const MON = { Mar: 4, Jun: 1, Sep: 2, Dec: 3 }
export function qLabel(p) {
  const [m, y] = String(p).split(' ')
  const q = MON[m]
  if (!q) return p
  const fy = q === 4 ? +y : +y + 1
  return `Q${q}'${String(fy).slice(-2)}`
}
const sg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`
const IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const cr = (v) => (v == null ? '—' : `₹${IN.format(v)} cr`)
const yoy = (arr, i) => (i >= 4 && arr[i] != null && arr[i - 4] ? ((arr[i] / arr[i - 4]) - 1) * 100 : null)

export function Tag({ kind }) {
  const m = {
    rep: ['Company figure', 'bg-[#EAF1F8] text-[#2C5A85]'],
    calc: ['Calculated', 'bg-mint text-forest'],
    unk: ['Not known yet', 'bg-md-bg text-md-fg'],
  }[kind]
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[10.5px] font-semibold leading-4 ${m[1]}`}><i className="inline-block h-1.5 w-1.5 rounded-sm bg-current" />{m[0]}</span>
}

/** Turns the latest quarter into one finding, an impact level and one reason. All inputs come from reported figures. */
export function readOf(s) {
  const q = s.quarters, n = q.revenue.length, i = n - 1
  const r = s.latest_quarter?.revenue_yoy ?? yoy(q.revenue, i)
  const p = s.latest_quarter?.pat_yoy ?? yoy(q.pat, i)
  const opm = q.opm.filter((v) => v != null)
  const avg = opm.length ? opm.reduce((a, b) => a + b, 0) / opm.length : null
  const m = q.opm[i]
  if (r == null && p == null) return null
  const big = Math.max(Math.abs(r ?? 0), Math.abs(p ?? 0))
  const lv = big < 5 ? 1 : big < 15 ? 2 : 3
  const head = [r != null && `Sales ${sg(r)}`, p != null && `profit ${sg(p)}`].filter(Boolean).join(', ') + ' year on year.'
  let why
  if (r != null && p != null && Math.sign(r) !== Math.sign(p)) why = `Sales and profit moved in opposite directions. Check costs, other income and one-offs in the rows below.`
  else if (r != null && p != null && Math.abs(p - r) > 10) why = p > r ? 'Profit grew much faster than sales. Look for one-offs or lower tax before treating it as a trend.' : 'Profit lagged sales. Costs rose faster than revenue.'
  else why = 'Sales and profit moved together.'
  if (m != null && avg != null) why += ` Operating margin is ${m.toFixed(0)}%, ${Math.abs(m - avg) < 1.5 ? 'in line with' : m > avg ? 'above' : 'below'} the ${n}-quarter average of ${avg.toFixed(0)}%.`
  return { head, lv, why }
}

function Meter({ lv }) {
  const col = ['', 'bg-[#3DB872]', 'bg-md-bar', 'bg-hi-bar'][lv]
  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-1" aria-hidden="true">
        {[1, 2, 3].map((k) => <div key={k} className={`h-1.5 rounded ${k <= lv ? col : 'bg-line'}`} />)}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate2">
        <span>Size of change: <b className="text-navy">{['', 'Small', 'Moderate', 'Large'][lv]}</b></span><span>Small · Moderate · Large</span>
      </div>
    </>
  )
}

export default function TrendPanel({ symbol, onAsk }) {
  const [st, setSt] = useState({ loading: true })
  const [tab, setTab] = useState('overview')
  const [sel, setSel] = useState(null)
  useEffect(() => {
    let alive = true
    setSt({ loading: true })
    api.snapshot(symbol).then((s) => alive && setSt({ s })).catch((e) => alive && setSt({ err: e.message }))
    return () => { alive = false }
  }, [symbol])

  if (st.loading) return <p className="inline-flex items-center gap-2 text-[13px] text-slate2"><Loader2 size={14} className="animate-spin" />Building the 8-quarter trend…</p>
  const s = st.s
  if (!s?.quarters?.revenue?.length) return null
  const q = s.quarters, labels = q.periods.map(qLabel), n = labels.length
  const read = readOf(s)
  const gi = labels.map((_, i) => i).filter((i) => i >= 4)
  const gr = { labels: gi.map((i) => labels[i]), rev: gi.map((i) => +yoy(q.revenue, i).toFixed(1)), pat: gi.map((i) => +yoy(q.pat, i).toFixed(1)) }
  const i = tab === 'overview' ? (sel ?? n - 1) : (sel ?? gr.labels.length - 1)

  return (
    <div className="space-y-3" data-testid="trend-panel">
      {read && (
        <section aria-label="QuarterNote's read" className="card border-[#D3EEE2] bg-gradient-to-b from-mint to-surface p-3.5">
          <div className="section-label">QuarterNote’s read</div>
          <p className="mt-1.5 text-[17px] font-extrabold leading-snug text-navy">{read.head}</p>
          <Meter lv={read.lv} />
          <p className="mt-2 text-[13px] leading-snug text-slate2">{read.why}</p>
        </section>
      )}

      <section aria-label="Trend" className="card p-3.5">
        <h3 className="text-[15.5px] font-bold text-navy">Is the growth real?</h3>
        <p className="text-[12px] text-slate2">Last {n} quarters · {s.latest_quarter?.basis || 'Consolidated'} · ₹ crore</p>
        <div role="tablist" className="mt-3 flex rounded-[10px] border border-line bg-offwhite p-[3px]">
          {[['overview', 'Overview'], ['growth', 'Growth %']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSel(null) }}
              className={`flex-1 rounded-[7px] py-1.5 text-[12.5px] font-semibold ${tab === k ? 'bg-surface text-forest shadow-sm' : 'text-slate2'}`}>{l}</button>
          ))}
        </div>

        {tab === 'overview'
          ? <ComboChart labels={labels} revenue={q.revenue} profit={q.pat} margin={q.opm} sel={i} onSelect={setSel} />
          : gr.labels.length
            ? <GrowthChart labels={gr.labels} rev={gr.rev} pat={gr.pat} sel={i} onSelect={setSel} />
            : <p className="mt-3 text-[13px] text-slate2">Not enough history for year-on-year growth.</p>}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] bg-offwhite px-2.5 py-2 text-[12.5px] text-navy">
          {tab === 'overview' ? (
            <>
              <span><b>{labels[i]}</b> · sales <b className="tabular-nums">{cr(q.revenue[i])}</b> · profit <b className="tabular-nums">{cr(q.pat[i])}</b>{q.opm[i] != null && <> · margin <b>{q.opm[i]}%</b></>}</span>
              <Tag kind="rep" />
              {yoy(q.revenue, i) != null && <span className="basis-full text-slate2">Year on year: sales {sg(yoy(q.revenue, i))}, profit {sg(yoy(q.pat, i))} <Tag kind="calc" /></span>}
            </>
          ) : gr.labels.length ? (
            <><span><b>{gr.labels[i]}</b> · sales {sg(gr.rev[i])} · profit {sg(gr.pat[i])}</span><Tag kind="calc" /></>
          ) : null}
          {s.source?.url && (
            <a href={s.source.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-emerald">Source <ExternalLink size={11} /></a>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate2">Tap a quarter for its figures. Trend data: {s.source?.title || 'screener.in'}. The rows below are checked against the filing where marked.</p>

        {onAsk && (
          <div className="mt-3 flex flex-col gap-2">
            {['What drove the change in profit this quarter?', 'Is this in line with management guidance?'].map((qq) => (
              <button key={qq} onClick={() => onAsk(qq)} className="flex items-center gap-2 rounded-xl border border-[#D3EEE2] bg-mint px-3 py-2 text-left text-[13px] font-medium text-forest">
                <Sparkles size={15} className="shrink-0" />{qq}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
