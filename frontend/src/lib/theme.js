// Theme choice is stored on this device only (same as the other preferences).
// Applied before the first render so there is no flash of the wrong theme.
export function applyTheme(choice) {
  const pref = choice || readStored() || 'light'
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

function readStored() {
  try { return JSON.parse(localStorage.getItem('finn:theme')) } catch { return null }
}

export function setTheme(choice) {
  try { localStorage.setItem('finn:theme', JSON.stringify(choice)) } catch { /* private mode */ }
  applyTheme(choice)
}
