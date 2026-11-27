// Dashboard-style charts used on results updates. Pure SVG, scaled from the data, tap to select a column.

export function niceTicks(lo, hi, n = 3) {
  const st = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, (hi - lo) / n))))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * st).find((x) => Math.ceil(hi / x - 1e-9) - Math.floor(lo / x + 1e-9) <= n + 1) || st * 10
  const out = []
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step
  for (let v = a; v <= b + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}
const kfmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v))

export function Legend({ items }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-3 text-[11px] text-slate2">
      {items.map(([l, c, line]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <i className="inline-block" style={{ width: 14, height: line ? 2 : 9, borderRadius: 1, background: c }} />{l}
        </span>
      ))}
    </div>
  )
}

function Hit({ x, w, h, on, onSelect, label, children }) {
  return (
    <g role="button" tabIndex={0} aria-label={label} aria-pressed={on} className="cursor-pointer focus:outline-none"
      onClick={onSelect} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}>
      <rect x={x} y={0} width={w} height={h} fill={on ? 'rgba(20,43,58,.045)' : 'transparent'} />
      {children}
    </g>
  )
}

const T = { lab: { fontSize: 9.5, fill: 'var(--ch-slate)' }, note: { fontSize: 8.5, fill: 'var(--ch-muted)' } }
const pt = { fontSize: 8.5, fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--ch-halo)', strokeWidth: 3, strokeLinejoin: 'round' }

/** Revenue (green) and profit (grey) bars with an operating-margin line on a right-hand % axis. */
export function ComboChart({ labels, revenue, profit, margin, sel, onSelect }) {
  const W = 340, H = 190, top = 24, bot = 22, pl = 30, pr = 30, n = labels.length, ch = H - top - bot, bw = (W - pl - pr) / n
  const ticks = niceTicks(0, Math.max(...revenue, ...profit) * 1.5, 4), max = ticks[ticks.length - 1]
  const mHi = Math.max(10, Math.ceil(Math.max(...margin.filter((v) => v != null)) / 5) * 5 + 5)
  const y = (v) => top + ch - (Math.max(0, v) / max) * ch
  const yr = (v) => top + ch - (v / mHi) * ch
  const cx = (i) => pl + i * bw + bw / 2
  const pts = margin.map((v, i) => (v == null ? null : `${cx(i)},${yr(v)}`)).filter(Boolean).join(' ')
  return (
    <>
      <Legend items={[['Revenue', 'var(--ch-green)'], ['Net profit', 'var(--ch-grey)'], ['Operating margin', 'var(--ch-teal)', 1]]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Revenue, profit and margin by quarter">
        {ticks.map((t, k) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--ch-grid)" />
            <text x={pl - 6} y={y(t) + 3} textAnchor="end" style={T.note}>{kfmt(t)}</text>
            <text x={W - pr + 6} y={y(t) + 3} style={T.note}>{Math.round((mHi * k) / (ticks.length - 1))}%</text>
          </g>
        ))}
        {labels.map((l, i) => {
          const on = i === sel, w = bw * 0.3
          return (
            <Hit key={l} x={pl + i * bw} w={bw} h={H} on={on} onSelect={() => onSelect(i)} label={`${l}: revenue ${revenue[i]}, profit ${profit[i]}`}>
              <rect x={cx(i) - w - 1} y={y(revenue[i])} width={w} height={top + ch - y(revenue[i])} rx={1} fill={on ? 'var(--ch-green-d)' : 'var(--ch-green)'} />
              <rect x={cx(i) + 1} y={y(profit[i])} width={w} height={top + ch - y(profit[i])} rx={1} fill="var(--ch-grey)" />
              <text x={cx(i)} y={H - 6} textAnchor="middle" style={{ ...T.lab, fontWeight: on ? 700 : 400, fill: on ? 'var(--ch-navy)' : T.lab.fill }}>{l}</text>
            </Hit>
          )
        })}
        <polyline points={pts} fill="none" stroke="var(--ch-teal)" strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none" />
        {margin.map((v, i) => v == null ? null : (
          <g key={i} pointerEvents="none">
            <circle cx={cx(i)} cy={yr(v)} r={i === sel ? 3.6 : 2.6} fill="var(--ch-halo)" stroke="var(--ch-teal)" strokeWidth={1.5} />
            <text x={cx(i)} y={yr(v) - 7} textAnchor="middle" style={{ ...pt, fill: 'var(--ch-teal)' }}>{v.toFixed(0)}%</text>
          </g>
        ))}
      </svg>
    </>
  )
}

/** Year-on-year growth of revenue and profit as two lines with light area fills. */
export function GrowthChart({ labels, rev, pat, sel, onSelect }) {
  const W = 340, H = 180, top = 22, bot = 22, pl = 34, n = labels.length, ch = H - top - bot, bw = (W - pl) / n
  const vals = [...rev, ...pat].filter((v) => v != null)
  const ticks = niceTicks(Math.min(0, ...vals) * 1.1, Math.max(0, ...vals) * 1.1, 3)
  const lo = ticks[0], hi = ticks[ticks.length - 1]
  const y = (v) => top + ch - ((v - lo) / (hi - lo)) * ch
  const cx = (i) => pl + i * bw + bw / 2
  const area = (arr, c) => `M${cx(0)},${y(0)} ${arr.map((v, i) => `L${cx(i)},${y(v)}`).join(' ')} L${cx(n - 1)},${y(0)}Z`
  const series = [[rev, 'var(--ch-green)', pat], [pat, 'var(--ch-indigo)', rev]]
  return (
    <>
      <Legend items={[['Revenue growth', 'var(--ch-green)', 1], ['Profit growth', 'var(--ch-indigo)', 1]]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Year-on-year growth of revenue and profit">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pl} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--ch-axis)' : 'var(--ch-grid)'} />
            <text x={pl - 6} y={y(t) + 3} textAnchor="end" style={T.note}>{t}%</text>
          </g>
        ))}
        {series.map(([arr, c]) => <path key={c} d={area(arr, c)} fill={c} opacity={0.08} />)}
        {labels.map((l, i) => (
          <Hit key={l} x={pl + i * bw} w={bw} h={H} on={i === sel} onSelect={() => onSelect(i)} label={`${l}: revenue ${rev[i]}%, profit ${pat[i]}%`}>
            <text x={cx(i)} y={H - 6} textAnchor="middle" style={{ ...T.lab, fontWeight: i === sel ? 700 : 400, fill: i === sel ? 'var(--ch-navy)' : T.lab.fill }}>{l}</text>
          </Hit>
        ))}
        {series.map(([arr, c, other]) => (
          <g key={c} pointerEvents="none">
            <polyline points={arr.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
            {arr.map((v, i) => (
              <g key={i}>
                <circle cx={cx(i)} cy={y(v)} r={3} fill="var(--ch-halo)" stroke={c} strokeWidth={1.6} />
                <text x={cx(i)} y={v >= other[i] ? y(v) - 8 : y(v) + 14} textAnchor="middle" style={{ ...pt, fill: c }}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </>
  )
}
