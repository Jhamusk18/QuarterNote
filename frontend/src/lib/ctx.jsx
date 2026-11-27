import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocal, DEFAULT_THRESHOLDS } from './store'
import { api } from './api'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [thresholds, setThresholds] = useLocal('thresholds', DEFAULT_THRESHOLDS)
  const [followed, setFollowed] = useLocal('followed', null) // null = all portfolio companies
  const [saved, setSaved] = useLocal('saved', [])
  const [prefs, setPrefs] = useLocal('prefs', { density: 'comfortable', showSummaries: true })
  const [companies, setCompanies] = useState({ portfolio: [], adhoc: [] })
  const [thresholdsOpen, setThresholdsOpen] = useState(false)
  // The digest lives here (not in the Updates screen) so opening an update and coming
  // back doesn't refetch, reorder or lose the reader's scroll position.
  const [digest, setDigest] = useState({ data: null, err: null, loading: true })
  const updatesScroll = useRef(0)
  const loadedFor = useRef(null)

  useEffect(() => { api.companies().then(setCompanies).catch(() => {}) }, [])

  const reloadDigest = useCallback((th = thresholds) => {
    setDigest((d) => ({ ...d, loading: true, err: null }))
    api.digest(th)
      .then((data) => setDigest({ data, err: null, loading: false }))
      .catch((e) => setDigest((d) => ({ ...d, err: e.message, loading: false })))
  }, [thresholds])

  useEffect(() => {
    const key = JSON.stringify(thresholds)
    if (loadedFor.current === key) return
    loadedFor.current = key
    reloadDigest(thresholds)
  }, [thresholds, reloadDigest])

  const portfolio = companies.portfolio
  const followedSet = new Set(followed ?? portfolio.map((c) => c.symbol))

  return (
    <Ctx.Provider value={{
      thresholds, setThresholds, followed, setFollowed, followedSet, saved, setSaved, prefs, setPrefs,
      companies, portfolio, thresholdsOpen, setThresholdsOpen, digest, reloadDigest, updatesScroll,
    }}>
      {children}
    </Ctx.Provider>
  )
}
