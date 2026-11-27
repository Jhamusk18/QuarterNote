import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useApp } from '../lib/ctx'
import { stamp } from '../lib/format'
import { ModeBadge } from '../components/Badges'
import { eventIcon } from './UpdateRow'
import { DISCLAIMER } from './Updates'

export function useBackToUpdates() {
  const nav = useNavigate()
  return () => (window.history.state?.idx > 0 ? nav(-1) : nav('/updates'))
}

export function BackToUpdates() {
  const back = useBackToUpdates()
  return (
    <button onClick={back} className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-[14px] font-semibold text-emerald focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald">
      <ArrowLeft size={18} /> Back to Updates
    </button>
  )
}

/** Shared header + timestamps + source actions for every update type. */
export function DetailShell({ it, children, refreshedAt }) {
  const Icon = eventIcon(it)
  const isMarket = it.kind === 'market'
  return (
    <div className="h-full overflow-y-auto no-scrollbar" data-testid="update-detail">
      <header className="sticky top-0 z-10 border-b border-line bg-offwhite/95 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <BackToUpdates />
      </header>
      <article className="space-y-3 px-4 pb-8 pt-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
              <span className="rounded-full bg-[#E3F1EA] px-2 py-[1px] text-forest">{it.symbol}</span>
              <span className="text-slate2">{it.category_label}</span>
              {it.simulated && <span className="rounded-full bg-[#FFF1E6] px-1.5 text-[#B54708]">Simulated</span>}
              {it.historical && <span className="rounded-full bg-[#E8F1FF] px-1.5 text-[#1D4ED8]">Historical example · manually verified</span>}
            </div>
            <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight text-navy">{it.company}</h1>
            {it.period_label && <p className="text-[14px] font-semibold text-slate2">{it.period_label}</p>}
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mint text-emerald"><Icon size={22} /></span>
        </div>

        <h2 className="text-[19px] font-extrabold leading-snug text-navy">{it.headline || it.title}</h2>

        {it.why && (
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-navy">
            <span className="font-bold">Why flagged:</span> {it.why}
          </p>
        )}

        {children}

        <section aria-label="Source and timestamps" className="card space-y-1.5 p-3 text-[12.5px] text-slate2">
          {isMarket ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Market session {it.details?.session_date || '—'} · {it.details?.source || it.feed}</span>
              <ModeBadge mode="EOD" asOf={it.details?.as_of || it.datetime} />
            </div>
          ) : (
            <div>Filed {stamp(it.datetime)} IST · via {it.feed}</div>
          )}
          {refreshedAt && <div>FINN refreshed {stamp(refreshedAt)} IST</div>}
          {!isMarket && it.title && it.title !== it.headline && <div className="text-navy/80">Filing title: {it.title}</div>}
          {it.url && it.url !== '#' && (
            <a href={it.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 pt-1 text-[14px] font-bold text-emerald">
              <FileText size={16} /> {isMarket ? 'Open price chart' : 'Open original filing'} <ExternalLink size={14} />
            </a>
          )}
        </section>
        <p className="px-1 text-center text-[11.5px] text-slate2">{DISCLAIMER}</p>
      </article>
    </div>
  )
}

export default function UpdateDetail() {
  const { id } = useParams()
  const { digest } = useApp()
  const it = digest.data?.items?.find((x) => x.id === id)

  if (!it) {
    return (
      <div className="h-full overflow-y-auto">
        <header className="border-b border-line px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]"><BackToUpdates /></header>
        <div className="p-6 text-center text-[14px] text-slate2">
          {digest.loading ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Loading update…</span>
            : 'This update is not in the last 30 days of filings any more.'}
        </div>
      </div>
    )
  }
  return <DetailShell it={it} refreshedAt={digest.data?.generated_at} />
}
