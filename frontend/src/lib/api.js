const BASE = import.meta.env.VITE_API_BASE || ''

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, opts)
  let body = null
  try { body = await r.json() } catch { body = null }
  if (!r.ok) {
    const msg = body?.detail || body?.error || `Request failed (${r.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return body
}

export const api = {
  digest: (th) => {
    const p = new URLSearchParams({
      vol: th.volume_multiple, px: th.price_move_pct,
      material: th.material_categories.join(','),
      overrides: JSON.stringify(th.overrides || {}),
    })
    return req(`/api/digest?${p}`)
  },
  update: (id) => req(`/api/updates/${encodeURIComponent(id)}`),
  historical: () => req('/api/updates/historical'),
  passages: (id) => req(`/api/updates/${encodeURIComponent(id)}/passages`),
  management: (id) => req(`/api/updates/${encodeURIComponent(id)}/management`),
  market: () => req('/api/market'),
  status: () => req('/api/status'),
  companies: () => req('/api/companies'),
  search: (q) => req(`/api/company/search?q=${encodeURIComponent(q)}`),
  quote: (s) => req(`/api/quote/${encodeURIComponent(s)}`),
  prepare: (s) => req(`/api/research/${encodeURIComponent(s)}/prepare`, { method: 'POST' }),
  rstatus: (s) => req(`/api/research/${encodeURIComponent(s)}/status`),
  snapshot: (s) => req(`/api/research/${encodeURIComponent(s)}/snapshot`),
  ask: (body) => req('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  guidance: (s) => req(`/api/research/${encodeURIComponent(s)}/guidance-vs-actuals`),
  upload: (s, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req(`/api/research/${encodeURIComponent(s)}/upload`, { method: 'POST', body: fd })
  },
}
