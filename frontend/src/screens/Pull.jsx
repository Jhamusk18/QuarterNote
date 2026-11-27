import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, ChevronDown, Bot, User, Paperclip, Send, Loader2, AlertTriangle, Target, ExternalLink, X } from 'lucide-react'
import { LogoTile } from '../components/Logo'
import { ModeBadge } from '../components/Badges'
import { api } from '../lib/api'
import { useApp } from '../lib/ctx'
import { useLocal } from '../lib/store'
import { num2, pct } from '../lib/format'
import { AnswerBody, SnapshotCard, GuidanceCard } from './PullCards'
import CompanyReview from './CompanyReview'

const CHIPS = [
  ['guidance', 'Guidance vs Actuals', true], ['financial', 'Financial snapshot'], ['business', 'Business snapshot'], ['trajectory', 'Trajectory'],
  ['balance', 'Balance sheet'], ['cash', 'Cash quality'], ['narrative', 'Narrative vs numbers'], ['bullbear', 'Bull vs bear'], ['risks', 'Key risks'],
]
const VIEW_Q = {
  financial: 'Give me the financial snapshot', business: 'What does the business do and how is revenue split?', trajectory: 'Show the multi-year trajectory',
  balance: 'How strong is the balance sheet?', cash: 'Do profits convert into cash?', narrative: 'Where do the narrative and the numbers diverge?',
  bullbear: 'Give me the bull vs bear case', risks: 'What are the key financial risks?', guidance: 'Did management deliver on its guidance over the last four quarters?',
}
const UPDATE_QUESTIONS = {
  results: 'What changed in these results?',
  management_change: 'Who is changing roles, and when?',
  litigation: 'What did the order say, and did the company disclose any financial impact?',
  'M&A': 'What is the deal, and has it been completed?',
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
  if (!st) return null
  const count = st.indexed_docs?.length || 0
  const label = st.state === 'ready' ? (count ? `${count} source${count === 1 ? '' : 's'} ready` : 'No sources available') :
    st.state === 'error' ? 'Sources unavailable' : 'Preparing sources…'
  return <p role="status" className="text-[12px] text-slate2">{label}</p>
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
  const [view, setView] = useState('chat')
  const [update, setUpdate] = useState(null)
  const scroller = useRef(null)
  const fileRef = useRef(null)
  const questionRef = useRef(null)
  const pendingQ = useRef(null)
  const sym = company?.symbol
  const threadKey = update ? `${sym}:${update.id}` : sym
  const msgs = threads[threadKey] || []

  const setMsgs = (fn) => setThreads((t) => ({ ...t, [threadKey]: fn(t[threadKey] || []) }))
  const patch = (id, p) => setThreads((t) => ({ ...t, [threadKey]: (t[threadKey] || []).map((m) => (m.id === id ? { ...m, ...p } : m)) }))

  // prefill from Updates (Investigate / Ask QuarterNote)
  useEffect(() => {
    const st = loc.state
    if (st?.symbol) {
      setCompany({ symbol: st.symbol, name: st.name || st.symbol })
      setUpdate(st.update || null)
      pendingQ.current = st.update ? null : st.question || null
      if (st.update) {
        setInput(st.update.isMarket ? 'What moved, and what do the price or volume numbers show?' :
          UPDATE_QUESTIONS[st.update.category] || 'What did the company announce?')
      }
      if (st.question || st.update) setView('chat')
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

  useEffect(() => {
    scroller.current?.scrollTo({ top: view === 'chat' ? scroller.current.scrollHeight : 0 })
  }, [view, msgs.length, busy])

  const history = () => msgs.filter((m) => m.role === 'user' || m.answer).slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : m.answer.answer }))

  async function send(text, view = null) {
    const q = (text ?? input).trim()
    if (!q || !sym) return
    setInput('')
    if (!update && status?.state !== 'ready') {
      pendingQ.current = q
      setMsgs((m) => [...m, { id: MID++, role: 'user', text: q, time: nowT() }])
      return
    }
    const id = MID++
    const hist = history()
    setMsgs((m) => [...m, { id: MID++, role: 'user', text: q, time: nowT() }, { id, role: 'finn', time: nowT(), company: sym, pending: 'Checking sources…', question: q }])
    setBusy(true)
    try {
      const r = await api.ask({ symbol: sym, question: q, history: hist, view, update_id: update?.id })
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
        pending: view === 'guidance' ? 'Checking management guidance…' : 'Loading financials…' }])
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
  const askAboutResults = ({ symbol, name, question }) => {
    pendingQ.current = null
    setUpdate(null)
    setCompany({ symbol, name })
    setInput(question)
    setView('chat')
    requestAnimationFrame(() => questionRef.current?.focus())
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 space-y-3 bg-gradient-to-b from-[#E4F4EC] to-offwhite px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <LogoTile size={36} />
          <h1 className="text-[20px] font-extrabold text-navy">Company research</h1>
        </div>
        <CompanyPicker company={company} portfolio={companies.portfolio} adhoc={companies.adhoc}
          onPick={(c) => {
            if (c.symbol !== sym) {
              pendingQ.current = null
              setInput('')
              setUpdate(null)
              setView('chat')
            }
            setCompany({ symbol: c.symbol, name: c.name })
          }} />
        {quote && !quote.error && (!update || view === 'overview') && (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-navy tnum">
            <b>₹{num2(quote.close)}</b>
              <span className={quote.change_pct >= 0 ? 'font-semibold text-emerald' : 'font-semibold text-hi-fg'}>{pct(quote.change_pct, 2)}</span>
            <ModeBadge mode="EOD" asOf={quote.as_of} />
          </div>
        )}
        <div role="group" aria-label="Research view" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-offwhite p-1">
          {[['chat', 'Ask a question'], ['overview', 'Financial results']].map(([key, label]) => (
            <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}
              className={`min-h-10 rounded-lg text-[13px] font-semibold ${view === key ? 'bg-surface text-forest shadow-card' : 'text-slate2'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-3.5 pb-4 pt-2 no-scrollbar">
        {view === 'overview' && sym && <CompanyReview key={sym} symbol={sym} onAsk={askAboutResults} />}
        {view === 'chat' && <>
        {update ? (
          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] text-slate2">{update.label}{update.simulated && ' · Simulated'}</p>
              <button type="button" aria-label="Clear update" onClick={() => { setUpdate(null); setInput('') }} className="grid h-9 w-9 place-items-center rounded-full text-slate2"><X size={16} /></button>
            </div>
            <h2 className="text-[16px] font-bold text-navy">{update.title}</h2>
            {!update.simulated && update.url && update.url !== '#' && (
              <a href={update.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald">
                {update.isMarket ? 'View market data' : 'Open original filing'} <ExternalLink size={13} />
              </a>
            )}
          </section>
        ) : <>
        <IndexProgress st={status} />
        <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 no-scrollbar">
          {CHIPS.map(([k, l, star]) => (
            <button key={k} disabled={busy} onClick={() => runView(k)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${star ? 'border-forest bg-forest text-white' : 'border-line bg-surface text-navy'}`}>
              {star && <Target size={13} />}{l}
            </button>
          ))}
        </div>
        </>}
        {msgs.map((m) => <Bubble key={m.id} m={m} saved={savedIds.has(`${m.company}:${m.question}`)} onSave={m.answer ? () => save(m) : null} />)}
        </>}
      </div>

      {view === 'chat' && <div className="shrink-0 px-3 pb-2.5 pt-1.5">
        <div className="flex items-center gap-2 rounded-[22px] border border-line bg-surface p-2 shadow-card">
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-mint px-3 text-[14px] font-semibold text-navy">
            <Paperclip size={17} className="text-emerald" />Drop PDF
          </button>
          <div className="h-7 w-px bg-line" />
          <input ref={questionRef} aria-label="Your question" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={msgs.length ? 'Ask a follow-up…' : 'Ask about this company…'} className="min-w-0 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-[#8A97A3]" />
          <button disabled={!input.trim() || busy} onClick={() => send()} aria-label="Send" className="grid h-11 w-12 shrink-0 place-items-center rounded-2xl bg-forest text-white disabled:opacity-40">
            {busy ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
          </button>
        </div>
      </div>}
    </div>
  )
}
