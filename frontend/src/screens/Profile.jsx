import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Grid3x3, Bell, Bookmark, SlidersHorizontal, CircleHelp, Info, ChevronRight, Check, Trash2, CheckCircle2, AlertTriangle, MinusCircle, ExternalLink,
} from 'lucide-react'
import { BrandRow } from '../components/Logo'
import Sheet from '../components/Sheet'
import { useApp } from '../lib/ctx'
import { api } from '../lib/api'
import { useLocal } from '../lib/store'
import { setTheme } from '../lib/theme'
import { stamp } from '../lib/format'

const ROWS = [
  ['portfolio', Grid3x3, 'Portfolio preferences', 'Manage the companies you follow'],
  ['alerts', Bell, 'Alert preferences', 'Choose priority and category alerts'],
  ['saved', Bookmark, 'Saved research', 'Return to your saved questions and insights'],
  ['data', SlidersHorizontal, 'Appearance & data', 'Theme, EOD data and display settings'],
  ['help', CircleHelp, 'Help & feedback', 'Get help using QuarterNote'],
  ['about', Info, 'About QuarterNote', 'Version, sources and product information'],
]

function StatusRow({ ok, label, detail }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? AlertTriangle : MinusCircle
  const color = ok === true ? 'text-emerald' : ok === false ? 'text-md-fg' : 'text-slate2'
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon size={17} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0"><div className="text-[14px] font-semibold text-navy">{label}</div><div className="text-[12px] text-slate2">{detail}</div></div>
    </div>
  )
}

export default function Profile() {
  const nav = useNavigate()
  const { portfolio, companies, followed, setFollowed, followedSet, thresholds, setThresholdsOpen, saved, setSaved, prefs, setPrefs } = useApp()
  const [panel, setPanel] = useState(null)
  const [themePref, setThemePref] = useLocal('theme', 'light')
  const [st, setSt] = useState(null)
  const [fb, setFb] = useLocal('feedback', [])
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState(false)
  useEffect(() => { if (panel === 'data' || panel === 'about') api.status().then(setSt).catch(() => setSt({ error: true })) }, [panel])

  const toggle = (s) => {
    const cur = new Set(followed ?? portfolio.map((c) => c.symbol))
    cur.has(s) ? cur.delete(s) : cur.add(s)
    setFollowed([...cur])
  }
  const open = (k) => (k === 'alerts' ? setThresholdsOpen(true) : setPanel(k))

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <header className="bg-[#E4F2EB] px-4 pb-14 pt-[max(16px,env(safe-area-inset-top))]">
        <BrandRow right={<span className="inline-flex items-center gap-2 rounded-full border border-[#BFE6D0] bg-mint px-3.5 py-1.5 text-[13px] font-semibold text-forest"><span className="h-2 w-2 rounded-full bg-emerald" />Guest</span>} />
        <h1 className="mt-6 text-[30px] font-extrabold text-navy">Profile</h1>
        <p className="text-[14.5px] text-slate2">Your QuarterNote preferences, saved on this device</p>
      </header>
      <main className="-mt-10 space-y-4 px-3.5 pb-6">
        <section className="card flex items-center gap-4 p-5">
          <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-mint text-[30px] font-bold text-emerald">G</div>
          <div>
            <div className="text-[20px] font-bold text-navy">Guest Investor</div>
            <div className="text-[13.5px] text-slate2">Guest access · No account linked</div>
            <span className="mt-2 inline-block rounded-full border border-[#BFE6D0] bg-mint px-5 py-1 text-[11px] font-bold tracking-wide text-forest">DEMO MODE</span>
          </div>
        </section>

        <div className="section-label px-1 pt-1">Preferences</div>
        <section className="card divide-y divide-line px-1">
          {ROWS.map(([k, Icon, title, sub]) => (
            <button key={k} onClick={() => open(k)} className="flex w-full items-center gap-3.5 px-3 py-3.5 text-left">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mint text-emerald"><Icon size={21} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-navy">{title}</span>
                <span className="block text-[12.5px] text-slate2">
                  {k === 'portfolio' ? `Following ${followedSet.size} of ${portfolio.length} companies` : k === 'saved' ? `${saved.length} saved answer${saved.length === 1 ? '' : 's'}` : k === 'alerts' ? `Vol ≥${thresholds.volume_multiple}× · Price ±${thresholds.price_move_pct}% · ${thresholds.material_categories.length} categories` : sub}
                </span>
              </span>
              <ChevronRight size={19} className="text-slate2" />
            </button>
          ))}
        </section>

        <section className="card p-4">
          <div className="section-label">Session</div>
          <p className="mt-2 text-[14.5px] text-navy">You are exploring QuarterNote as a guest.</p>
          <p className="text-[12.5px] text-slate2">Preferences are saved on this device only. No account, no cloud sync.</p>
        </section>
        <button onClick={() => nav('/')} className="h-12 w-full rounded-2xl border border-line bg-surface text-[15px] font-semibold text-forest shadow-card">Exit guest mode</button>
      </main>

      <Sheet open={panel === 'portfolio'} onClose={() => setPanel(null)} title="Portfolio preferences"
        right={<button className="text-[14px] font-semibold text-emerald" onClick={() => setFollowed(null)}>Follow all</button>}>
        <div className="px-5 py-3">
          <p className="text-[12.5px] text-slate2">Updates shows filings and alerts only for companies you follow.</p>
          <div className="mt-2 divide-y divide-line">
            {portfolio.map((c) => {
              const on = followedSet.has(c.symbol)
              return (
                <button key={c.symbol} onClick={() => toggle(c.symbol)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? 'border-emerald bg-emerald text-white' : 'border-[#B8C4BF]'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                  <span className="w-28 text-[14px] font-bold text-navy">{c.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate2">{c.name}</span>
                  <span className="text-[11px] text-slate2">{c.sector}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 section-label">Research ideas (outside portfolio)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {companies.adhoc.map((c) => (
              <button key={c.symbol} onClick={() => nav('/research', { state: { symbol: c.symbol, name: c.name } })} className="chip-opt chip-off">{c.symbol} →</button>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet open={panel === 'saved'} onClose={() => setPanel(null)} title="Saved research">
        <div className="space-y-2.5 px-5 py-3">
          {!saved.length && <p className="py-6 text-center text-[13.5px] text-slate2">Nothing saved yet. Tap the bookmark on any QuarterNote answer in Research.</p>}
          {saved.map((s) => (
            <div key={s.key} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between text-[11.5px] text-slate2"><span className="pill bg-mint text-forest">{s.symbol}</span>{stamp(s.at)}</div>
              <div className="mt-1.5 text-[14px] font-semibold text-navy">{s.question}</div>
              <p className="mt-1 line-clamp-3 text-[12.5px] text-slate2">{s.answer?.answer}</p>
              <div className="mt-2 flex gap-3 text-[13px] font-semibold">
                <button className="text-emerald" onClick={() => nav('/research', { state: { symbol: s.symbol, question: s.question } })}>Re-run in Research →</button>
                <button className="ml-auto text-slate2" onClick={() => setSaved(saved.filter((x) => x.key !== s.key))}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={panel === 'data'} onClose={() => setPanel(null)} title="Appearance & data">
        <div className="px-5 py-3">
          <div className="section-label">Display</div>
          <div className="mt-2 text-[12.5px] text-slate2">Theme</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => (
              <button key={k} onClick={() => { setTheme(k); setThemePref(k) }} className={`chip-opt ${themePref === k ? 'chip-on' : 'chip-off'}`}>{l}</button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {['comfortable', 'compact'].map((d) => <button key={d} onClick={() => setPrefs({ ...prefs, density: d })} className={`chip-opt ${prefs.density === d ? 'chip-on' : 'chip-off'}`}>{d[0].toUpperCase() + d.slice(1)}</button>)}
          </div>
          <div className="mt-5 section-label">Data sources · live status</div>
          {!st && <p className="py-3 text-[13px] text-slate2">Checking…</p>}
          {st?.error && <p className="py-3 text-[13px] text-hi-fg">Couldn’t reach the QuarterNote server.</p>}
          {st && !st.error && (
            <div className="mt-1 divide-y divide-line">
              <StatusRow ok={st.exchanges?.nse?.ok} label="NSE corporate announcements" detail={st.exchanges?.nse?.ok ? 'Live exchange feed (primary)' : st.exchanges?.nse?.detail} />
              <StatusRow ok={st.exchanges?.bse?.ok ?? null} label="BSE announcements API" detail={st.exchanges?.bse?.ok === null ? 'Fallback · not needed while NSE works' : st.exchanges?.bse?.detail} />
              <StatusRow ok={st.sources?.announcements?.ok ?? null} label="Filings digest" detail={st.sources?.announcements?.detail || 'Builds when Updates loads'} />
              <StatusRow ok={st.sources?.prices?.ok ?? null} label="Prices & volume (Yahoo Finance)" detail={`EOD bars · ${st.sources?.prices?.detail || 'loads with Updates'} · market ${st.market_open ? 'open (index tiles LIVE, quotes may be delayed)' : 'closed (EOD)'}`} />
              <StatusRow ok label="Fundamentals & documents (screener.in → BSE/NSE PDFs)" detail="Annual reports, call transcripts, investor presentations, standardised financials" />
              <StatusRow ok={st.llm?.enabled} label="AI layer" detail={st.llm?.enabled ? `${{ groq: 'Groq (free tier)', gemini: 'Google Gemini (free tier)' }[st.llm.provider] || 'Anthropic Claude'} · Fast: ${st.llm.fast_model} · Strong: ${st.llm.strong_model} · ${st.llm.calls} calls${st.llm.provider === 'anthropic' ? ` · $${st.llm.usd.toFixed(4)}` : ' · $0'} since ${stamp(st.llm.since)}` : 'Not configured (no API key): Research shows evidence passages; Guidance vs Actuals is off'} />
              {st.force_sample && <StatusRow ok={false} label="Sample mode forced" detail="All Updates items are SIMULATED" />}
            </div>
          )}
          <div className="mt-5 section-label">Device data</div>
          <button onClick={() => { Object.keys(localStorage).filter((k) => k.startsWith('finn:')).forEach((k) => localStorage.removeItem(k)); window.location.href = '/' }} className="mt-2 text-[13.5px] font-semibold text-hi-fg">Clear all QuarterNote data on this device</button>
        </div>
      </Sheet>

      <Sheet open={panel === 'help'} onClose={() => { setPanel(null); setSent(false) }} title="Help & feedback">
        <div className="space-y-3 px-5 py-3 text-[13.5px] leading-relaxed text-navy">
          {[
            ['How does QuarterNote rank filings?', 'Every NSE filing is classified into 17 categories (rules first, a cheap AI model only for ambiguous ones). Results, M&A, senior management changes, litigation and fund raises are High; routine compliance paperwork is collapsed.'],
            ['What do EOD, LIVE and Simulated mean?', 'EOD = end-of-day close from the last completed session. LIVE = intraday index quotes during market hours (may be delayed). Simulated = demo data shown only if live feeds fail. It is always labelled.'],
            ['Where do Research answers come from?', 'Only the company’s own documents: annual reports, results, earnings-call transcripts and investor presentations, plus standardised financials compiled from exchange filings. Every claim links to its page.'],
            ['What is Guidance vs Actuals?', 'QuarterNote reads the last four earnings calls, extracts each numerical promise, and checks it against what was later reported: Delivered, Partially delivered, Missed or Pending.'],
          ].map(([q, a]) => <details key={q} className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-1.5 text-slate2">{a}</p></details>)}
          <div className="section-label pt-2">Send feedback</div>
          {sent ? <p className="rounded-xl bg-mint p-3 text-forest">Thanks! Saved on this device ({fb.length} note{fb.length > 1 ? 's' : ''}). This prototype has no feedback server.</p> : (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="What would make QuarterNote more useful?" className="w-full rounded-xl border border-line p-3 outline-none focus:border-emerald" />
              <button disabled={!draft.trim()} onClick={() => { setFb([{ text: draft, at: new Date().toISOString() }, ...fb]); setDraft(''); setSent(true) }} className="btn-primary h-11 w-full">Save feedback</button>
            </>
          )}
        </div>
      </Sheet>

      <Sheet open={panel === 'about'} onClose={() => setPanel(null)} title="About QuarterNote">
        <div className="space-y-3 px-5 py-4 text-[13.5px] leading-relaxed text-navy">
          <div><div className="text-[22px] font-black text-[#0B4A35]">QuarterNote <span className="text-[13px] font-semibold text-slate2">v0.2.0 · prototype</span></div>
            <div className="font-semibold">Intelligence That Drives Informed Investment Decisions.</div></div>
          <p className="text-slate2">Updates filters the firehose of exchange filings and EOD moves down to what matters for your portfolio. Research answers research questions strictly from primary documents, and holds management accountable for what it guided.</p>
          <div className="section-label">Data sources</div>
          <ul className="list-disc space-y-1 pl-5 text-slate2">
            <li>NSE corporate announcements (fallback: BSE API, then screener.in feed)</li>
            <li>Yahoo Finance daily bars (EOD) for prices, volumes and indices</li>
            <li>screener.in for document links and standardised financials; PDFs from BSE/NSE</li>
          </ul>
          <div className="section-label">AI & cost</div>
          <p className="text-slate2">Rules before models. A fast, cheap model classifies ambiguous filings and extracts guidance; a stronger model is used only for Research reasoning and guidance verdicts. Retrieval is BM25 (no embedding cost); classifications, documents and answers are cached.</p>
          <div className="section-label">Disclaimer</div>
          <p className="text-slate2">For research and demonstration only. Not investment advice. Data may be delayed or incomplete; verify against the original filing before acting.</p>
          <a href="https://www.nseindia.com/companies-listing/corporate-filings-announcements" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald">NSE filings <ExternalLink size={13} /></a>
        </div>
      </Sheet>
    </div>
  )
}
