import { useEffect, useState } from 'react'

// All preferences are stored on this device only (guest mode, no account / cloud sync).
export function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem('finn:' + key)
      return raw ? JSON.parse(raw) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem('finn:' + key, JSON.stringify(v)) } catch { /* storage full / private mode */ }
  }, [key, v])
  return [v, setV]
}

export const DEFAULT_THRESHOLDS = {
  volume_multiple: 2,
  price_move_pct: 5,
  material_categories: ['results', 'M&A', 'management_change', 'fund_raise', 'litigation', 'credit_rating', 'pledging'],
  overrides: {},
}

export const CATEGORIES = [
  ['results', 'Results'], ['management_change', 'Management change'], ['M&A', 'M&A'], ['fund_raise', 'Fund raise'],
  ['dividend', 'Dividend'], ['credit_rating', 'Credit rating'], ['litigation', 'Litigation'], ['insider_trading', 'Insider trading'],
  ['earnings_call', 'Earnings call'], ['investor_meetings', 'Investor meetings'], ['bonus_split', 'Bonus / split'],
  ['capex', 'Capex'], ['press_release', 'Press release'], ['postal_ballot', 'Postal ballot'], ['agm_egm', 'AGM / EGM'],
  ['pledging', 'Pledging'], ['unclassified', 'Unclassified'],
]
export const MARKET_SIGNALS = [['price_movement', 'Price movement'], ['volume_surge', 'Volume surge']]
export const CAT_LABEL = Object.fromEntries([...CATEGORIES, ...MARKET_SIGNALS])

export const DEFAULT_FILTERS = { priority: 'all', companies: [], window: '7d', from: '', to: '', categories: [] }
