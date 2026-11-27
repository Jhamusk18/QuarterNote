import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, ChevronDown, Bot, User, Paperclip, Send, Loader2, CheckCircle2, AlertTriangle, FileText, Target, X, Building2, MessageCircle, ArrowLeft } from 'lucide-react'
import { BrandRow } from '../components/Logo'
import { ModeBadge } from '../components/Badges'
import { api } from '../lib/api'
import { useApp } from '../lib/ctx'
import { useLocal } from '../lib/store'
import { num2, pct } from '../lib/format'
import { AnswerBody, SnapshotCard, GuidanceCard } from './PullCards'

const CHIPS = [
  ['guidance', 'Guidance vs Actuals', true], ['financial', 'Financial snapshot'], ['business', 'Business snapshot'], ['trajectory', 'Trajectory'],
  ['balance', 'Balance sheet'], ['cash', 'Cash quality'], ['narrative', 'Narrative vs numbers'], ['bullbear', 'Bull vs bear'], ['risks', 'Key risks'],
]
const VIEW_Q = {
  financial: 'Give me the financial snapshot', business: 'What does the business do and how is revenue split?', trajectory: 'Show the multi-year trajectory',
  balance: 'How strong is the balance sheet?', cash: 'Do profits convert into cash?', narrative: 'Where do the narrative and the numbers diverge?',
  bullbear: 'Give me the bull vs bear case', risks: 'What are the key financial risks?', guidance: 'Did management deliver on its guidance over the last four quarters?',
}
const nowT = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
let MID = 1

function CompanyPicker({ company, onPick, portfolio, adhoc }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    if (q.trim().length < 2) { setRes([]); return }
    setBusy(true)
    const t = setTimeout(() => api.search(q).then((r) => setRes(r.results)).catch(() => setRes([])).finally(() => setBusy(false)), 250)
    return () => clearTimeout(t)
  }, [q, open])
  const pick = (c) => { onPick(c); setOpen(false); setQ('') }
  const list = q.trim().length >= 2 ? res : [...adhoc.map((c) => ({ ...c, tag: 'Research idea' })), ...portfolio.map((c) => ({ ...c, tag: 'Portfolio' }))]
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-[52px] w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 shadow-card">
        <Search size={21} className="text-slate2" />
        <span className="min-w-0 flex-1 truncate text-left text-[16px] text-navy">
          {company ? <><b>{company.symbol}</b> – {company.name}</> : <span className="text-slate2">Search any NSE / BSE company…</span>}
        </span>
        <ChevronDown size={20} className="text-navy" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[58px] z-40 max-h-[60vh] overflow-hidden rounded-2xl border border-line bg-surface shadow-sheet animate-fadein">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search size={17} className="text-slate2" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or ticker, e.g. Bajaj Auto, PIDILITIND" className="w-full text-[14px] outline-none" />
            {busy ? <Loader2 size={16} className="animate-spin text-slate2" /> : <button onClick={() => setOpen(false)}><X size={17} className="text-slate2" /></button>}
          </div>
          <div className="max-h-[48vh] overflow-y-auto">
            {list.map((c) => (
              <button key={c.symbol} onClick={() => pick(c)} className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-offwhite">
                <span className="w-24 shrink-0 truncate text-[13px] font-bold text-navy">{c.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate2">{c.name}</span>
                {c.tag && <span className="pill bg-mint text-forest">{c.tag}</span>}
              </button>
            ))}
            {q.trim().length >= 2 && !busy && !res.length && <p className="px-4 py-4 text-[13px] text-slate2">No listed company found for “{q}”.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function IndexProgress({ st }) {
  if (!st || st.state === 'ready') return null
  const failed = st.state === 'error'
  return (
    <div className={`rounded-2xl border p-3 ${failed ? 'border-hi-bd bg-hi-bg' : 'border-line bg-surface'}`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-navy">
        {failed ? <AlertTriangle size={16} className="text-hi-fg" /> : <Loader2 size={16} className="animate-spin text-emerald" />}
        {failed ? `Couldn’t prepare documents: ${st.message}` : st.message || 'Preparing primary documents…'}
      </div>
      {!failed && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6EEEA]"><div className="h-full rounded-full bg-emerald transition-all" style={{ width: `${Math.round((st.progress || 0.03) * 100)}%` }} /></div>}
      {st.docs?.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11.5px] text-slate2">
          {st.docs.map((d) => (
            <li key={d.url} className="flex items-center gap-1.5">
              {d.state === 'ready' ? <CheckCircle2 size={12} className="text-emerald" /> : d.state === 'error' ? <AlertTriangle size={12} className="text-hi-fg" /> : d.state === 'processing' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              <span className="truncate">{d.title}{d.pages ? ` · ${d.pages} pages` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Bubble({ m, saved, onSave }) {
  if (m.role === 'user') {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-offwhite px-3.5 py-2.5">
          <div className="text-[11.5px] text-slate2">{m.time}</div>
          <div className="text-[15px] leading-snug text-navy">{m.text}</div>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-mint text-emerald"><User size={20} /></div>
      </div>
    )
  }
  if (m.role === 'system') {
    return <div className="text-center"><span className="rounded-full bg-offwhite px-3 py-1 text-[11.5px] text-slate2">{m.text}</span></div>
  }
  return (
    <div className="flex items-start gap-2.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-mint text-emerald"><Bot size={21} /></div>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-mint px-3.5 py-3">
        <div className="text-[11.5px] text-slate2">{m.time}{m.company ? ` · ${m.company}` : ''}</div>
        {m.pending && (
          <div className="mt-1 flex items-center gap-2 text-[13.5px] text-slate2"><Loader2 size={15} className="animate-spin text-emerald" />{m.pending}</div>
        )}
        {m.text && <p className="mt-0.5 text-[15px] leading-relaxed text-navy">{m.text}</p>}
        {m.error && <p className="mt-1 flex gap-1.5 text-[13px] text-hi-fg"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{m.error}</p>}
        {m.snapshot && <div className="mt-2 rounded-xl bg-mint/60 p-2.5"><SnapshotCard view={m.view} s={m.snapshot} /></div>}
        {m.guidance && <div className="mt-1"><GuidanceCard g={m.guidance} /></div>}
        {m.answer && <div className={m.snapshot ? 'mt-3' : 'mt-1'}><AnswerBody r={m.answer} saved={saved} onSave={onSave} /></div>}
      </div>
    </div>
  )
}

const IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function Tile({ label, value, yoy }) {
  return (
    <div className="rounded-2xl bg-surface p-2.5">
      <div className="text-[11.5px] font-semibold text-slate2">{label}</div>
      <div className="mt-0.5 text-[19px] font-extrabold tabular-nums text-navy">{value == null ? '—' : `₹${IN.format(value)} cr`}</div>
      {yoy != null && <div className={`text-[11.5px] font-semibold ${yoy >= 0 ? 'text-rt-fg' : 'text-hi-fg'}`}>{yoy >= 0 ? '▲' : '▼'} {Math.abs(yoy).toFixed(1)}% vs year ago</div>}
    </div>
  )
}

function CompanySnapshot({ sym, quote, status }) {
  const [s, setS] = useState(null)
  useEffect(() => {
    let alive = true
    setS(null)
    api.snapshot(sym).then((r) => alive && setS(r)).catch((e) => alive && setS({ error: e.message }))
    return () => { alive = false }
  }, [sym])
  const lq = s?.latest_quarter
  return (
    <section aria-label="Company snapshot" className="rounded-3xl border border-[#CFE9DC] bg-mint/60 p-3">
      <div className="flex items-center gap-2">
        <Building2 size={17} className="text-emerald" />
        <h2 className="flex-1 text-[15px] font-extrabold text-navy">Company snapshot</h2>
        {quote && !quote.error && (
          <span className="flex items-center gap-1.5 text-[12px] tabular-nums text-navy"><b>₹{num2(quote.close)}</b>
            <span className={quote.change_pct >= 0 ? 'font-semibold text-emerald' : 'font-semibold text-hi-fg'}>{pct(quote.change_pct, 2)}</span>
          </span>
        )}
      </div>
      {!s && <p className="mt-2 inline-flex items-center gap-2 text-[12.5px] text-slate2"><Loader2 size={14} className="animate-spin" />Loading latest results…</p>}
      {s?.error && <p className="mt-2 text-[12.5px] text-slate2">Latest results unavailable: {s.error}</p>}
      {lq && (
        <>
          <div className="mt-2 text-[12.5px] font-bold text-navy">Latest results · {lq.period_label} · {lq.basis}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <Tile label={lq.revenue_label} value={lq.revenue} yoy={lq.revenue_yoy} />
            {lq.operating_profit != null
              ? <Tile label="Operating profit" value={lq.operating_profit} yoy={lq.operating_profit_yoy} />
              : <Tile label="Net profit" value={lq.pat} yoy={lq.pat_yoy} />}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate2">
            From <a href={s.source.url} target="_blank" rel="noreferrer" className="font-semibold text-emerald underline">screener.in</a>’s standardised table, not verified against the filing.
            {quote && !quote.error && <> Price: <ModeBadge mode="EOD" asOf={quote.as_of} /></>}
          </p>
        </>
      )}
      {status?.state === 'ready' && <p className="mt-1 text-[11px] text-slate2">{(status.indexed_docs || []).length} primary documents ready to search.</p>}
    </section>
  )
}

export default function Pull() {
  const loc = useLocation()
  const nav = useNavigate()
  const { companies, saved, setSaved } = useApp()
  const [company, setCompany] = useLocal('pull:company', { symbol: 'INFY', name: 'Infosys Ltd' })
  const [threads, setThreads] = useState({})
  const [status, setStatus] = useState(null)
  const [quote, setQuote] = useState(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef(null)
  const fileRef = useRef(null)
  const pendingQ = useRef(null)
  const [context, setContext] = useState(null)
  const sym = company?.symbol
  const msgs = threads[sym] || []
  const suggestion = 'What drove the change in operating profit last quarter?'

  const setMsgs = (fn) => setThreads((t) => ({ ...t, [sym]: fn(t[sym] || []) }))
  const patch = (id, p) => setThreads((t) => ({ ...t, [sym]: (t[sym] || []).map((m) => (m.id === id ? { ...m, ...p } : m)) }))

  // prefill from Updates (detail page / Ask QuarterNote)
  useEffect(() => {
    const st = loc.state
    if (st?.symbol) {
      setCompany({ symbol: st.symbol, name: st.name || st.symbol })
      if (st.period) {
        setContext({ symbol: st.symbol, period: st.period, question: st.question })
        setInput(st.question || '')
      } else {
        setContext(null)
        pendingQ.current = st.question || null
      }
      nav('/research', { replace: true, state: null })
    }
  }, [loc.state]) // eslint-disable-line

  // prepare documents + quote whenever the company changes
  useEffect(() => {
    if (!sym) return
    let stop = false
    setStatus({ state: 'queued', message: 'Finding primary documents…', progress: 0.02 })
    setQuote(null)
    api.quote(sym).then((q) => !stop && setQuote(q)).catch(() => !stop && setQuote({ error: true }))
    api.prepare(sym).then(() => {
      const poll = () => api.rstatus(sym).then((s) => {
        if (stop) return
        setStatus(s)
        if (s.state !== 'ready' && s.state !== 'error') setTimeout(poll, 1000)
      }).catch(() => !stop && setTimeout(poll, 2000))
      poll()
    }).catch((e) => !stop && setStatus({ state: 'error', message: e.message }))
    return () => { stop = true }
  }, [sym])

  // run a queued question once the index is ready
  useEffect(() => {
    if (status?.state === 'ready' && pendingQ.current) {
      const q = pendingQ.current
      pendingQ.current = null
      if (q === 'GUIDANCE') runView('guidance'); else send(q)
    }
  }, [status?.state]) // eslint-disable-line

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, busy])

  const history = () => msgs.filter((m) => m.role === 'user' || m.answer).slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : m.answer.answer }))

  async function send(text, view = null) {
    const q = (text ?? input).trim()
    if (!q || !sym) return
    setInput('')
    if (status?.state !== 'ready') {
      pendingQ.current = q
      setMsgs((m) => [...m, { id: MID++, role: 'user', text: q, time: nowT() }])
      return
    }
    const id = MID++
    const hist = history()
    setMsgs((m) => [...m, { id: MID++, role: 'user', text: q, time: nowT() }, { id, role: 'finn', time: nowT(), company: sym, pending: 'Searching annual reports, results and call transcripts…', question: q }])
    setBusy(true)
    try {
      const r = await api.ask({ symbol: sym, question: q, history: hist, view })
      patch(id, { pending: null, answer: r })
    } catch (e) {
      patch(id, { pending: null, error: e.message })
    } finally { setBusy(false) }
  }

  async function runView(view) {
    if (view !== 'guidance' && view !== 'financial' && view !== 'trajectory' && view !== 'balance' && view !== 'cash') return send(VIEW_Q[view], view)
    if (status?.state !== 'ready' && view === 'guidance') { pendingQ.current = 'GUIDANCE'; return }
    const id = MID++
    setMsgs((m) => [...m, { id: MID++, role: 'user', text: VIEW_Q[view], time: nowT() },
      { id, role: 'finn', time: nowT(), company: sym, view, question: VIEW_Q[view],
        pending: view === 'guidance' ? 'Reading the last four earnings calls and matching each promise to reported results…' : 'Computing from standardised financials…' }])
    setBusy(true)
    try {
      if (view === 'guidance') {
        const g = await api.guidance(sym)
        patch(id, { pending: null, guidance: g })
      } else {
        const s = await api.snapshot(sym)
        const withAi = status?.state === 'ready' && status?.llm
        patch(id, { snapshot: s, pending: withAi ? 'Adding commentary from primary documents…' : null })
        if (withAi) {
          const r = await api.ask({ symbol: sym, question: VIEW_Q[view], history: [], view })
          patch(id, { pending: null, answer: r })
        }
      }
    } catch (e) { patch(id, { pending: null, error: e.message }) } finally { setBusy(false) }
  }

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const id = MID++
    setMsgs((m) => [...m, { id, role: 'finn', time: nowT(), company: sym, pending: `Uploading ${f.name} (${(f.size / 1e6).toFixed(1)} MB)… extracting text and indexing pages` }])
    try {
      const r = await api.upload(sym, f)
      patch(id, { pending: null, text: `✓ ${f.name} is ready: ${r.doc.pages} pages, ${r.doc.passages} passages indexed for ${sym}. I’ll cite it like any other source.` })
    } catch (err) { patch(id, { pending: null, error: `${f.name} was not added. ${err.message}` }) }
  }

  const savedIds = new Set(saved.map((s) => s.key))
  const save = (m) => {
    const key = `${m.company}:${m.question}`
    if (savedIds.has(key)) setSaved(saved.filter((s) => s.key !== key))
    else setSaved([{ key, symbol: m.company, question: m.question, answer: m.answer, at: new Date().toISOString() }, ...saved].slice(0, 50))
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 space-y-3 bg-gradient-to-b from-[#E4F4EC] to-offwhite px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))]">
        <BrandRow right={<span className="inline-flex items-center gap-2 rounded-full border border-[#BFE6D0] bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-navy"><span className="h-2 w-2 rounded-full bg-emerald" />EOD Data</span>} />
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-navy">Research</h1>
        <CompanyPicker company={company} portfolio={companies.portfolio} adhoc={companies.adhoc}
          onPick={(c) => { if (c.symbol !== sym) { setThreads((t) => ({ ...t, [c.symbol]: t[c.symbol] || [] })); setContext(null) } setCompany({ symbol: c.symbol, name: c.name }) }} />
      </header>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-3.5 pb-4 pt-2 no-scrollbar">
        {context && context.symbol === sym && (
          <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12.5px] font-semibold text-navy shadow-card">
            <ArrowLeft size={14} className="text-emerald" />From update · {sym} {context.period} results
          </button>
        )}
        {sym && <CompanySnapshot sym={sym} quote={quote} status={status} />}
        {!msgs.length && (
          <button disabled={busy} onClick={() => send(context?.symbol === sym && context.question ? context.question : suggestion)}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 text-left shadow-card">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint text-emerald"><MessageCircle size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-semibold text-slate2">Suggested question</span>
              <span className="block text-[14px] font-semibold text-navy">{context?.symbol === sym && context.question ? context.question : suggestion}</span>
            </span>
          </button>
        )}
        <IndexProgress st={status} />
        <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 no-scrollbar">
          {CHIPS.map(([k, l, star]) => (
            <button key={k} disabled={busy} onClick={() => runView(k)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${star ? 'border-forest bg-forest text-white' : 'border-line bg-surface text-navy'}`}>
              {star && <Target size={13} />}{l}
            </button>
          ))}
        </div>
        {msgs.map((m) => <Bubble key={m.id} m={m} saved={savedIds.has(`${m.company}:${m.question}`)} onSave={m.answer ? () => save(m) : null} />)}
      </div>

      <div className="shrink-0 px-3 pb-2.5 pt-1.5">
        <div className="flex items-center gap-2 rounded-[22px] border border-line bg-surface p-2 shadow-card">
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} title="Add your own PDF (annual report, filing, transcript)" className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-line px-2.5 text-[12.5px] font-semibold text-slate2">
            <Paperclip size={15} className="text-emerald" />Add documents
          </button>
          <div className="h-7 w-px bg-line" />
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={msgs.length ? 'Ask QuarterNote a follow-up…' : 'Ask QuarterNote about this company…'} className="min-w-0 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-[#8A97A3]" />
          <button disabled={!input.trim() || busy} onClick={() => send()} aria-label="Send" className="grid h-11 w-12 shrink-0 place-items-center rounded-2xl bg-forest text-white disabled:opacity-40">
            {busy ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
          </button>
        </div>
      </div>
    </div>
  )
}
