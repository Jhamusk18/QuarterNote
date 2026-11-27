import { useState } from 'react'
import { BadgeCheck, ChevronDown, ExternalLink, FileSearch, Loader2, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { inr, stamp } from '../lib/format'

const STATUS = {
  completed: ['Completed', 'bg-rt-bg text-rt-fg'],
  approved: ['Approved, not completed', 'bg-[#E8F1FF] text-[#1D4ED8]'],
  proposed: ['Proposed', 'bg-md-bg text-md-fg'],
}

function PageLink({ src, asText }) {
  if (!src?.page) return null
  if (asText) return <span className="inline-block shrink-0 rounded-md border border-line px-1.5 py-[1px] text-[11px] font-bold text-slate2">p.{src.page}</span>
  return (
    <a href={src.url} target="_blank" rel="noreferrer"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-[1px] text-[11px] font-bold text-emerald">
      p.{src.page}<ExternalLink size={10} />
    </a>
  )
}

function Excerpt({ src, label = 'Filing excerpt' }) {
  if (!src?.excerpt) return null
  return (
    <blockquote className="mt-2 rounded-xl bg-offwhite px-3 py-2 text-[12.5px] text-navy">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate2">{label}{src.section ? ` · ${src.section}` : ''} <PageLink src={src} /></div>
      “{src.excerpt}”
    </blockquote>
  )
}

function FactValue({ f }) {
  if (f.state === 'not_disclosed') return <span className="italic text-slate2">Not disclosed in the filing</span>
  if (f.state === 'unavailable') return <span className="font-semibold text-slate2">Evidence unavailable</span>
  return <span>{f.value}</span>
}

function Fact({ f }) {
  const [open, setOpen] = useState(false)
  const verified = f.verified
  const hasMore = !!(f.source?.excerpt || f.note || f.items)
  const box = f.state === 'unavailable' ? 'border-dashed border-[#C9D3CF] bg-transparent' : 'border-line bg-surface'
  return (
    <li className={`rounded-2xl border ${box}`}>
      <button disabled={!hasMore || f.state === 'unavailable'} onClick={() => setOpen(!open)} aria-expanded={hasMore && f.state !== 'unavailable' ? open : undefined}
        className="block w-full px-3 py-2.5 text-left">
        <span className="flex items-center gap-2">
          <span className="flex-1 text-[11.5px] font-bold uppercase tracking-wide text-slate2">{f.label}</span>
          {verified && <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rt-fg"><BadgeCheck size={12} />Verified</span>}
          {!f.items && <PageLink src={f.source} asText />}
          {hasMore && f.state !== 'unavailable' && <ChevronDown size={16} className={`text-slate2 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </span>
        <span className="mt-1 block text-[14px] leading-snug text-navy">
          {f.items ? (
            <span className="flex flex-col gap-2">
              {f.items.map((i, k) => (
                <span key={k} className="block">
                  <span className={`mr-1.5 inline-block rounded-full px-1.5 py-[1px] align-[1px] text-[10.5px] font-bold ${STATUS[i.state]?.[1] || ''}`}>{STATUS[i.state]?.[0] || i.state}</span>
                  {i.text} <PageLink src={i.source} asText />
                </span>
              ))}
            </span>
          ) : <FactValue f={f} />}
        </span>
        {(f.state === 'candidate' || (f.state === 'unavailable' && f.note)) && (
          <span className="mt-1 block text-[11.5px] text-slate2">
            {f.state === 'candidate' ? `From ${f.source?.publisher || 'exchange text'} · not verified` : f.note}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {f.items ? f.items.map((i, k) => <Excerpt key={k} src={i.source} label={STATUS[i.state]?.[0]} />) : <Excerpt src={f.source} label={f.state === 'candidate' ? 'Exchange text' : 'Filing excerpt'} />}
        </div>
      )}
    </li>
  )
}

function Passages({ id }) {
  const [s, setS] = useState(null)
  const load = () => {
    setS({ state: 'loading' })
    api.passages(id).then(setS).catch((e) => setS({ state: 'unavailable', reason: e.message, passages: [] }))
  }
  if (!s) {
    return (
      <button onClick={load} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald py-2.5 text-[14px] font-bold text-emerald">
        <FileSearch size={16} />Find amounts and status in the filing
      </button>
    )
  }
  if (s.state === 'loading') return <p className="inline-flex items-center gap-2 text-[13px] text-slate2"><Loader2 size={14} className="animate-spin" />Reading the filing…</p>
  if (s.state !== 'ok') return <p className="rounded-xl bg-[#EEF1F0] px-3 py-2 text-[13px] text-slate2"><span className="font-bold text-navy">Evidence unavailable.</span> {s.reason}</p>
  return (
    <section aria-label="Candidate passages" className="space-y-2">
      <h3 className="text-[14px] font-extrabold text-navy">Candidate passages</h3>
      <p className="text-[12px] text-slate2">{s.note}</p>
      {s.passages.length === 0 && <p className="text-[13px] text-slate2">No amounts, status words or next steps found in the filing text ({s.pages} pages).</p>}
      {s.passages.map((p, i) => (
        <blockquote key={i} className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-navy">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate2">
            Candidate passage · not verified · {p.kind === 'amount' ? 'Amount' : p.kind === 'status' ? 'Status' : 'Next step'}
            <PageLink src={{ page: p.page, url: p.url }} />
          </div>
          “{p.excerpt}”
        </blockquote>
      ))}
    </section>
  )
}

function marketFacts(m) {
  const src = m.source
  const f = []
  if (m.observed_change_pct != null) {
    f.push({ label: 'Price move', value: `${m.observed_change_pct > 0 ? '+' : ''}${m.observed_change_pct.toFixed(2)}% (close ₹${m.close?.toLocaleString('en-IN')} vs ₹${m.prev_close?.toLocaleString('en-IN')})`, state: 'reported', source: src })
  }
  if (m.category === 'price_movement') f.push({ label: 'Your threshold', value: `±${m.threshold}%`, state: 'reported' })
  if (m.category === 'volume_surge') {
    f.push({ label: 'Volume', value: `${inr(m.volume)} shares, ${m.volume_multiple?.toFixed(1)}× the 20-day average of ${inr(m.avg_volume_20d)}`, state: 'reported', source: src })
    f.push({ label: 'Your threshold', value: `${m.threshold}× average volume`, state: 'reported' })
  }
  f.push({ label: 'Session', value: `${m.session_date || '—'} · end-of-day data${m.as_of ? `, as of ${stamp(m.as_of)} IST` : ''}`, state: 'reported' })
  f.push({ label: 'Source', value: src?.publisher || '—', state: 'reported' })
  f.push({ label: 'Cause', state: 'unavailable', note: 'Price data does not explain why the stock moved. Check this company’s filings for the same day.' })
  return f
}

export default function DisclosureFacts({ d }) {
  const it = d.item
  const disc = d.disclosure
  const verified = disc?.verification?.status === 'manually_verified'
  const facts = d.layout === 'market' ? marketFacts(d.market) : disc.facts
  const title = { ma: 'Deal facts', management: 'Who and what changed', litigation: 'Order and impact', market: 'What moved', filing: 'What the filing says' }[d.layout] || 'Key facts'
  return (
    <>
      {!verified && d.layout !== 'market' && (
        <p className="flex gap-2 rounded-xl border border-md-bd bg-md-bg px-3 py-2 text-[12.5px] text-md-fg">
          <TriangleAlert size={16} className="mt-[1px] shrink-0" />
          <span>Filing excerpt not verified. Facts below come from the exchange text or automated extraction; open the filing to check.</span>
        </p>
      )}
      <section aria-label={title}>
        <h3 className="mb-1.5 text-[15px] font-extrabold text-navy">{title}</h3>
        <ul className="space-y-2">{facts.map((f, i) => <Fact key={f.key || i} f={f} />)}</ul>
        {verified && <p className="mt-2 text-[11.5px] text-slate2">Tap a fact to read the filing excerpt it comes from.</p>}
      </section>
      {verified && disc.related_filings?.length > 0 && (
        <section aria-label="Related filings" className="card p-3 text-[12.5px] text-navy">
          <h3 className="text-[14px] font-extrabold">Related filing</h3>
          {disc.related_filings.map((r) => (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="mt-1 flex items-start justify-between gap-2">
              <span>{r.title}<span className="block text-[11.5px] text-slate2">Filed {stamp(r.datetime)} IST</span></span>
              <ExternalLink size={14} className="mt-1 shrink-0 text-emerald" />
            </a>
          ))}
        </section>
      )}
      {!verified && d.layout !== 'market' && it.url && <Passages id={it.id} />}
    </>
  )
}
