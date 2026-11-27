import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { inr, num2 } from '../lib/format'
import TrendPanel from './TrendPanel'

function QuarterChart({ periods, values, label }) {
  const points = periods.map((period, i) => ({ period, value: values[i] })).slice(-5)
  const numbers = points.map(({ value }) => value).filter(Number.isFinite)
  if (!numbers.length) return null
  const min = Math.min(0, ...numbers)
  const span = Math.max(0, ...numbers) - min || 1
  const zero = (-min / span) * 100

  return (
    <figure className="mt-4">
      <figcaption className="text-[12px] text-slate2">{label} · ₹ crore</figcaption>
      <ol className="mt-2 flex">
        {points.map(({ period, value }) => (
          <li key={period} className="min-w-0 flex-1 text-center">
            <p className="text-[11px] font-semibold text-navy tnum">{inr(value)}</p>
            <div aria-hidden className="relative mx-1 my-1 h-20">
              <span className="absolute inset-x-0 border-b border-line" style={{ bottom: `${zero}%` }} />
              {Number.isFinite(value) && (
                <span className={`absolute inset-x-1/4 rounded bg-emerald ${value < 0 ? 'opacity-50' : ''}`}
                  style={{ bottom: `${((Math.min(0, value) - min) / span) * 100}%`, height: `${(Math.abs(value) / span) * 100}%` }} />
              )}
            </div>
            <p className="text-[10.5px] text-slate2">{period.replace(/ (?:20)(\d\d)$/, ' $1')}</p>
          </li>
        ))}
      </ol>
    </figure>
  )
}

export default function CompanyReview({ symbol, onAsk }) {
  const [review, setReview] = useState({})
  useEffect(() => {
    let active = true
    api.snapshot(symbol).then((data) => {
      if (active) setReview(data.latest_quarter ? { data } : { unavailable: true })
    }).catch(() => { if (active) setReview({ unavailable: true }) })
    return () => { active = false }
  }, [symbol])

  if (review.data) return (
    <div className="space-y-3">
      <ReviewCard data={review.data} symbol={symbol} onAsk={onAsk} />
      <TrendPanel symbol={symbol} onAsk={(question) => onAsk({ symbol, name: review.data.name || symbol, question })} />
    </div>
  )

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-live="polite">
      <h2 className="font-bold text-navy">Financial results</h2>
      <p className="mt-1 text-[13px] text-slate2">
        {review.unavailable ? 'Financial results are unavailable for this company right now.' : 'Loading financial results…'}
      </p>
    </section>
  )
}

function ReviewCard({ data, symbol, onAsk }) {
  const [metric, setMetric] = useState('revenue')
  const q = data.latest_quarter
  const selected = metric === 'revenue' && !Number.isFinite(q.revenue) ? 'pat' : metric
  const values = data.quarters?.[selected] || []
  const sales = q.revenue_label || 'Revenue'
  const label = selected === 'revenue' ? sales : 'Net profit'
  const value = q[selected]
  const change = q[`${selected}_yoy`]
  const period = q.period_label || q.period
  const showChange = Number.isFinite(change) && values.at(-5) > 0
  const trend = change > 0 ? 'Up' : 'Down'
  const ask = () => onAsk({
    symbol,
    name: data.name || symbol,
    question: `What did management say about ${label.toLowerCase()} in ${period}?`,
  })
  return (
    <section aria-label="Company summary" className="rounded-2xl border border-line bg-surface p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-extrabold text-navy">Latest results</h2>
          <p className="text-[12px] text-slate2">{data.name || symbol} · {period}{q.basis && ` · ${q.basis}`}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Choose financial metric">
        {[['revenue', sales], ['pat', 'Net profit']].filter(([key]) => Number.isFinite(q[key])).map(([key, text]) => (
          <button key={key} type="button" aria-pressed={selected === key} onClick={() => setMetric(key)}
            className={`min-h-10 rounded-full border px-3 text-[13px] font-semibold ${selected === key ? 'border-emerald bg-mint text-forest' : 'border-line text-slate2'}`}>
            {text}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[27px] font-extrabold leading-tight text-navy tnum">
        {Number.isFinite(value) ? `₹${inr(value)} cr` : '—'}
      </p>
      {showChange && <p className="mt-1 text-[12px] text-slate2">
        {change === 0 ? 'Unchanged' : `${trend} ${num2(Math.abs(change))}%`} from the same quarter last year
      </p>}
      {data.quarters && <QuarterChart periods={data.quarters.periods} values={values} label={label} />}
      {data.source?.url && (
        <a href={data.source.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-9 items-center gap-1 text-[12px] font-semibold text-emerald">
          View financial data on Screener.in <ExternalLink size={13} />
        </a>
      )}
      <div className="mt-2 border-t border-line pt-2">
        <button type="button" onClick={ask} className="inline-flex min-h-10 w-full items-center justify-between gap-2 text-left text-[13px] font-semibold text-emerald">
          Ask about these results <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </section>
  )
}
