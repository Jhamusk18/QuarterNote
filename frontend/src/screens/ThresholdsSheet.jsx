import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import Sheet from '../components/Sheet'
import { useApp } from '../lib/ctx'
import { CATEGORIES, DEFAULT_THRESHOLDS } from '../lib/store'

function Stepper({ value, onChange, step, min, max, suffix }) {
  return (
    <div className="flex items-center gap-2">
      <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lg font-bold" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}>−</button>
      <div className="w-16 text-center text-[18px] font-extrabold text-navy tnum">{value}{suffix}</div>
      <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lg font-bold" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}>+</button>
    </div>
  )
}

export default function ThresholdsSheet() {
  const { thresholds, setThresholds, thresholdsOpen, setThresholdsOpen, portfolio } = useApp()
  const [d, setD] = useState(thresholds)
  const [ovSym, setOvSym] = useState('')
  useEffect(() => { if (thresholdsOpen) setD(thresholds) }, [thresholdsOpen]) // eslint-disable-line
  const toggle = (k) => setD({ ...d, material_categories: d.material_categories.includes(k) ? d.material_categories.filter((x) => x !== k) : [...d.material_categories, k] })
  const close = () => setThresholdsOpen(false)
  const setOv = (sym, key, val) => setD({ ...d, overrides: { ...d.overrides, [sym]: { ...(d.overrides[sym] || {}), [key]: val } } })
  const delOv = (sym) => { const o = { ...d.overrides }; delete o[sym]; setD({ ...d, overrides: o }) }

  return (
    <Sheet open={thresholdsOpen} onClose={close} title="Alert thresholds"
      right={<button className="text-[15px] font-semibold text-emerald" onClick={() => setD(DEFAULT_THRESHOLDS)}>Defaults</button>}
      footer={<div className="flex gap-3">
        <button className="btn-ghost h-12 flex-1 bg-surface" onClick={close}>Cancel</button>
        <button className="btn-primary h-12 flex-[1.6]" onClick={() => { setThresholds(d); close() }}>Save thresholds</button>
      </div>}>
      <div className="space-y-5 px-5 py-4">
        <p className="text-[12.5px] text-slate2">You decide what “unusual” means. QuarterNote checks every portfolio stock’s completed end-of-day bar against these rules. Saved on this device.</p>
        <div className="flex items-center justify-between">
          <div><div className="text-[15px] font-bold text-navy">Volume spike</div><div className="text-[12px] text-slate2">Day volume ≥ N× its 20-day average</div></div>
          <Stepper value={d.volume_multiple} step={0.5} min={1} max={10} suffix="×" onChange={(v) => setD({ ...d, volume_multiple: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div><div className="text-[15px] font-bold text-navy">Price move</div><div className="text-[12px] text-slate2">Close-to-close move beyond ±X%</div></div>
          <Stepper value={d.price_move_pct} step={0.5} min={0.5} max={20} suffix="%" onChange={(v) => setD({ ...d, price_move_pct: v })} />
        </div>
        <div>
          <div className="text-[15px] font-bold text-navy">Material announcement types</div>
          <div className="text-[12px] text-slate2">Filings in these categories are flagged as triggered alerts</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {CATEGORIES.filter(([k]) => k !== 'unclassified').map(([k, l]) => {
              const on = d.material_categories.includes(k)
              return <button key={k} onClick={() => toggle(k)} className={`chip-opt inline-flex items-center gap-1 ${on ? 'chip-on' : 'chip-off'}`}>{on && <Check size={13} />}{l}</button>
            })}
          </div>
        </div>
        <div>
          <div className="text-[15px] font-bold text-navy">Per-company overrides</div>
          <div className="text-[12px] text-slate2">e.g. a tighter price band for a volatile small-cap</div>
          {Object.entries(d.overrides).map(([sym, o]) => (
            <div key={sym} className="mt-2 flex items-center gap-2 rounded-xl border border-line p-2.5 text-[13px]">
              <span className="w-24 font-bold">{sym}</span>
              <label className="flex items-center gap-1">Vol<input type="number" step="0.5" min="1" value={o.volume_multiple ?? ''} placeholder={d.volume_multiple} onChange={(e) => setOv(sym, 'volume_multiple', e.target.value ? +e.target.value : undefined)} className="w-14 rounded border border-line px-1 py-1" />×</label>
              <label className="flex items-center gap-1">Px ±<input type="number" step="0.5" min="0.5" value={o.price_move_pct ?? ''} placeholder={d.price_move_pct} onChange={(e) => setOv(sym, 'price_move_pct', e.target.value ? +e.target.value : undefined)} className="w-14 rounded border border-line px-1 py-1" />%</label>
              <button onClick={() => delOv(sym)} className="ml-auto text-slate2" aria-label="Remove override"><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <select value={ovSym} onChange={(e) => setOvSym(e.target.value)} className="h-10 flex-1 rounded-xl border border-line px-2 text-[13px]">
              <option value="">Choose company…</option>
              {portfolio.filter((c) => !d.overrides[c.symbol]).map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
            </select>
            <button disabled={!ovSym} onClick={() => { setOv(ovSym, 'price_move_pct', d.price_move_pct); setOvSym('') }} className="btn-ghost h-10 px-3 text-[13px]"><Plus size={15} />Add</button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
