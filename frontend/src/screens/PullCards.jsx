import { FileText, ExternalLink, Bookmark, BookmarkCheck, Calculator, Quote, Sparkles, AlertCircle, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react'
import MiniBars from '../components/MiniBars'
import { inr, pct } from '../lib/format'

const KIND = {
  reported: ['Reported', 'bg-[#E8F1FF] text-[#1D4ED8]', Quote],
  calculated: ['Calculated', 'bg-[#F1ECFF] text-[#6D28D9]', Calculator],
  interpretation: ['QuarterNote view', 'bg-mint text-forest', Sparkles],
}

export function Cite({ id, sources }) {
  const s = sources?.find((x) => x.id === id)
  if (!s) return <span className="text-slate2">[{id}]</span>
  return (
    <a href={s.url} target="_blank" rel="noreferrer" title={`${s.title}${s.page ? ` p.${s.page}` : ''}`}
      className="mx-0.5 inline-flex -translate-y-px items-center rounded-md bg-[#D7F0E4] px-1 text-[11px] font-bold text-forest no-underline">
      {id}
    </a>
  )
}

export function WithCites({ text, sources }) {
  const parts = (text || '').split(/(\[S\d+(?:,\s*S\d+)*\])/g)
  return parts.map((p, i) => {
    const m = p.match(/^\[(S\d+(?:,\s*S\d+)*)\]$/)
    if (!m) return <span key={i}>{p}</span>
    return <span key={i}>{m[1].split(/,\s*/).map((id) => <Cite key={id} id={id} sources={sources} />)}</span>
  })
}

export function SourcesList({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="flex items-center gap-1.5 text-[14px] font-bold text-forest"><FileText size={15} /> Sources Cited</div>
      <div className="mt-2 space-y-1.5">
        {sources.map((s) => (
          <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-mint px-2.5 py-2 text-[12.5px] text-navy">
            <FileText size={15} className="shrink-0 text-forest" />
            <span className="font-bold">[{s.id}]</span>
            <span className="min-w-0 flex-1 truncate">{s.title}{s.page ? ` (p.${s.page})` : s.kind === 'table' ? ' (table)' : ''}</span>
            <ExternalLink size={14} className="shrink-0 text-forest" />
          </a>
        ))}
      </div>
    </div>
  )
}

export function AnswerBody({ r, onSave, saved }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-forest">QuarterNote:</span>
        <div className="flex items-center gap-1.5">
          <span className={`pill ${r.mode === 'ai' ? 'bg-mint text-forest' : 'bg-[#FFF6E0] text-md-fg'}`}>
            {r.mode === 'ai' ? 'AI · grounded' : r.mode === 'extractive' ? 'Evidence only · AI off' : 'No evidence'}
          </span>
          {onSave && (
            <button onClick={onSave} aria-label="Save research" className="text-forest">{saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[14.5px] leading-relaxed text-navy"><WithCites text={r.answer} sources={r.sources} /></p>
      {r.findings?.length > 0 && (
        <ul className="mt-2 space-y-2">
          {r.findings.map((f, i) => {
            const [label, cls, Icon] = KIND[f.kind] || KIND.reported
            return (
              <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-navy">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                <span>
                  <span className={`pill mr-1 !px-1.5 !py-0 !text-[10px] ${cls}`}><Icon size={10} />{label}</span>
                  {f.text}{f.sources?.map((id) => <Cite key={id} id={id} sources={r.sources} />)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {r.verdict && <p className="mt-2 rounded-lg bg-surface/70 px-2.5 py-2 text-[13px] font-medium text-navy"><span className="font-bold text-forest">So what: </span><WithCites text={r.verdict} sources={r.sources} /></p>}
      {r.not_found?.length > 0 && (
        <p className="mt-2 flex gap-1.5 text-[12.5px] text-md-fg"><AlertCircle size={14} className="mt-0.5 shrink-0" />Not found in sources: {r.not_found.join('; ')}</p>
      )}
      <SourcesList sources={r.sources} />
    </div>
  )
}

// ---------------------------------------------------------------- deterministic snapshot cards
const short = (p) => (p || '').replace(/^(\w{3}) 20(\d\d)$/, '$1 $2')

export function SnapshotCard({ view, s }) {
  const src = (
    <a href={s.source.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-[11px] text-slate2">
      <Calculator size={12} /> Calculated from standardised financials (compiled from exchange filings) <ExternalLink size={11} />
    </a>
  )
  if (view === 'financial' && s.latest_quarter) {
    const q = s.latest_quarter
    const tiles = [['Revenue', `₹${inr(q.revenue)} Cr`, pct(q.revenue_yoy) + ' YoY'], ['PAT', `₹${inr(q.pat)} Cr`, pct(q.pat_yoy) + ' YoY'], ['OPM', q.opm != null ? `${q.opm}%` : '—', 'operating margin']]
    const r = s.ratios || {}
    return (
      <div>
        <div className="text-[13px] font-bold text-navy">Financial snapshot · {short(q.period)} quarter</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {tiles.map(([k, v, d]) => (
            <div key={k} className="rounded-xl bg-surface p-2"><div className="text-[11px] text-slate2">{k}</div><div className="text-[15px] font-extrabold text-navy tnum">{v}</div><div className="text-[11px] font-semibold text-emerald">{d}</div></div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          {['Market Cap', 'Stock P/E', 'ROCE', 'ROE', 'Dividend Yield', 'Book Value'].filter((k) => r[k]).map((k) => (
            <div key={k} className="flex justify-between border-b border-line py-0.5"><span className="text-slate2">{k}</span><span className="font-semibold text-navy">{r[k]}</span></div>
          ))}
        </div>
        <p className="mt-1 text-[10.5px] text-slate2">Ratios use the latest price (screener.in) and are not EOD-timestamped.</p>
        {src}
      </div>
    )
  }
  if (view === 'trajectory' && s.annual) {
    const a = s.annual
    return (
      <div>
        <div className="text-[13px] font-bold text-navy">Trajectory · FY revenue & PAT (₹ Cr)</div>
        <div className="mt-1 flex gap-3 text-[12px]">
          {s.cagr?.revenue_5y != null && <span>Revenue 5Y CAGR <b className="text-emerald">{s.cagr.revenue_5y}%</b></span>}
          {s.cagr?.pat_5y != null && <span>PAT 5Y CAGR <b className="text-emerald">{s.cagr.pat_5y}%</b></span>}
        </div>
        <div className="mt-2"><MiniBars labels={a.periods.map((p) => 'FY' + p.slice(-2))} series={[{ name: 'Revenue', values: a.revenue, color: '#0D9367' }, { name: 'PAT', values: a.pat, color: '#7DD3AE' }]} /></div>
        {a.opm?.length > 0 && <div className="mt-1 text-[12px] text-slate2">OPM: {a.opm.map((v, i) => <span key={i} className="mr-1.5 font-semibold text-navy">{v ?? '–'}%</span>)}</div>}
        {src}
      </div>
    )
  }
  if (view === 'balance' && s.balance) {
    const b = s.balance
    return (
      <div>
        <div className="text-[13px] font-bold text-navy">Balance sheet · {short(b.period)}</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[['Borrowings', `₹${inr(b.borrowings)} Cr`], ['Net worth', `₹${inr(b.net_worth)} Cr`], ['Debt / Equity', `${b.debt_to_equity ?? '—'}×`]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface p-2"><div className="text-[11px] text-slate2">{k}</div><div className="text-[15px] font-extrabold text-navy tnum">{v}</div></div>
          ))}
        </div>
        <div className="mt-2"><MiniBars labels={b.periods.map(short)} series={[{ name: 'Borrowings', values: b.borrowings_trend, color: '#F2B01E' }]} h={60} /></div>
        {src}
      </div>
    )
  }
  if (view === 'cash' && s.cash) {
    const c = s.cash
    return (
      <div>
        <div className="text-[13px] font-bold text-navy">Cash quality · operating cash flow vs PAT (₹ Cr)</div>
        {c.conversion_pct_5y != null && <div className="mt-1 text-[12px]">Cash conversion (Σ CFO ÷ Σ PAT, {c.periods.length}Y): <b className={c.conversion_pct_5y >= 90 ? 'text-emerald' : 'text-md-fg'}>{c.conversion_pct_5y}%</b></div>}
        <div className="mt-2"><MiniBars labels={c.periods.map((p) => 'FY' + p.slice(-2))} series={[{ name: 'CFO', values: c.cfo, color: '#0D9367' }, { name: 'PAT', values: c.pat, color: '#9AA9B4' }]} /></div>
        {src}
      </div>
    )
  }
  return null
}

// ---------------------------------------------------------------- guidance vs actuals
const VERDICT = {
  Delivered: ['bg-rt-bg text-rt-fg', CheckCircle2],
  'Partially delivered': ['bg-md-bg text-md-fg', MinusCircle],
  Missed: ['bg-hi-bg text-hi-fg', XCircle],
  Pending: ['bg-offwhite text-slate2', Clock],
  Raised: ['bg-rt-bg text-rt-fg', CheckCircle2],
  Cut: ['bg-hi-bg text-hi-fg', XCircle],
}

export function GuidanceCard({ g }) {
  if (!g.available) {
    return (
      <div>
        <div className="text-[14px] font-extrabold text-forest">Management Guidance vs Actuals</div>
        <p className="mt-1.5 text-[13px] text-navy">{g.reason}</p>
        {g.calls_found?.length > 0 && <p className="mt-1.5 text-[12px] text-slate2">Calls found and ready to analyse: {g.calls_found.join(' · ')}</p>}
      </div>
    )
  }
  const tally = (g.rows || []).reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] || 0) + 1 }), {})
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-extrabold text-forest">Management Guidance vs Actuals</div>
        <span className="pill bg-surface text-slate2">{g.rows?.length || 0} promises</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(tally).map(([k, v]) => <span key={k} className={`pill ${VERDICT[k]?.[0]}`}>{v} {k}</span>)}
      </div>
      {g.summary && <p className="mt-2 text-[13.5px] leading-relaxed text-navy"><WithCites text={g.summary} sources={g.sources} /></p>}
      <div className="mt-2 space-y-2">
        {(g.rows || []).map((r, i) => {
          const [cls, Icon] = VERDICT[r.verdict] || VERDICT.Pending
          return (
            <div key={i} className="rounded-xl border border-line bg-surface p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13.5px] font-bold text-navy">{r.metric}</div>
                <span className={`pill shrink-0 ${cls}`}><Icon size={12} />{r.verdict}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[12.5px] leading-snug">
                <span className="text-slate2">Guided</span>
                <span className="text-navy"><b>{r.guided}</b> <span className="text-slate2">({r.guided_in})</span><Cite id={r.guidance_source} sources={g.sources} /></span>
                <span className="text-slate2">Actual</span>
                <span className="text-navy">{r.actual}{r.actual_source && r.actual_source.split(/,\s*/).map((id) => <Cite key={id} id={id} sources={g.sources} />)}</span>
                {r.variance && <><span className="text-slate2">Variance</span><span className="font-semibold text-navy">{r.variance}</span></>}
                {r.reason && <><span className="text-slate2">Why</span><span className="text-navy">{r.reason}</span></>}
              </div>
            </div>
          )
        })}
      </div>
      <SourcesList sources={g.sources} />
    </div>
  )
}
