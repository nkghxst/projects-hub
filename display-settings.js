// Theme belongs to this browser; collection defaults belong to its profile destination.
                                                   
                                                                                                                                   
export const THEME_KEY = 'hub.theme'
export const DISPLAY_PREFIX = 'hub.display:'
const defaults = ()                  => ({ artwork: 'full', grouped: false, sort: 'checkpoint' })
const valid = (v         )                       => {
  if (!v || typeof v !== 'object') return false
  const p = v                   
  return ['full', 'compact', 'off'].includes(p.artwork) && typeof p.grouped === 'boolean' && ['checkpoint', 'edited', 'index'].includes(p.sort)
}
export function readDisplaySettings(dest        )                  {
  try {
    const stored = JSON.parse(localStorage.getItem(DISPLAY_PREFIX + dest) ?? 'null')
    if (stored?.version === 1 && valid(stored.value)) return { artwork: stored.value.artwork, grouped: stored.value.grouped, sort: stored.value.sort }
  } catch { /* Unavailable or corrupt storage uses safe defaults. */ }
  return defaults()
}
export function saveDisplaySettings(dest        , value                 )       {
  if (!dest || !valid(value)) throw new Error('Invalid display preferences.')
  localStorage.setItem(DISPLAY_PREFIX + dest, JSON.stringify({ version: 1, value }))
}
export function readTheme()              {
  try { const value = localStorage.getItem(THEME_KEY); if (value === 'light' || value === 'dark') return value } catch { /* OS fallback. */ }
  return 'auto'
}
let scheme                            
let initialised = false
function applyTheme()       {
  const choice = readTheme()
  const theme = choice === 'auto' ? (scheme?.matches ? 'dark' : 'light') : choice
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1a1a19' : '#eeeee8')
}
export function initDisplaySettings()       {
  if (!initialised) {
    initialised = true
    scheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    scheme?.addEventListener('change', applyTheme)
    globalThis.addEventListener?.('storage', event => { if ((event                ).key === THEME_KEY || (event                ).key === null) applyTheme() })
  }
  applyTheme()
}
export function saveTheme(value             )       {
  if (!['auto', 'light', 'dark'].includes(value)) throw new Error('Invalid theme preference.')
  localStorage.setItem(THEME_KEY, value)
  initDisplaySettings()
}
const esc = (value        ) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
export function displaySettingsMarkup(dest        )         {
  const p = readDisplaySettings(dest)
  const options = (values          , labels          , selected        ) => values.map((v, i) => `<option value="${v}"${v === selected ? ' selected' : ''}>${labels[i]}</option>`).join('')
  return `<section class="card form display-settings"><h3 class="home-h">Appearance</h3>
    <label>Colour theme<select data-display-setting="theme">${options(['auto','light','dark'], ['Auto — follow this device','Light','Dark'], readTheme())}</select></label>
    <p class="muted small">Theme is saved in this browser and follows the device live when set to Auto.</p>
    <h3 class="home-h">Collection defaults</h3><p class="muted small">Saved on this device for this profile destination. Used when opening the collection; saved views keep their own choices.</p>
    <label>Project artwork<select data-display-setting="artwork" data-dest="${esc(dest)}"${dest ? '' : ' disabled'}>${options(['full','compact','off'], ['Full covers','Compact covers','Off'], p.artwork)}</select></label>
    <label>Opening view<select data-display-setting="grouped" data-dest="${esc(dest)}"${dest ? '' : ' disabled'}>${options(['false','true'], ['All projects','Grouped'], String(p.grouped))}</select></label>
    <label>Default sort<select data-display-setting="sort" data-dest="${esc(dest)}"${dest ? '' : ' disabled'}>${options(['checkpoint','edited','index'], ['Newest checkpoint','Recently edited','Index order'], p.sort)}</select></label>
    ${dest ? '' : '<p class="muted small">Connect a profile to save collection defaults.</p>'}
    <p class="display-settings-status muted small" role="status"></p></section>`
}
// Call from the app's delegated change handler. A failed write is surfaced to the caller.
export function handleDisplaySetting(target             )          {
  const name = target.dataset.displaySetting
  if (!name) return false
  const value = (target                     ).value
  if (name === 'theme') saveTheme(value               )
  else {
    if (!['artwork','grouped','sort'].includes(name)) return false
    if (name === 'grouped' && value !== 'true' && value !== 'false') throw new Error('Invalid opening view.')
    const dest = target.dataset.dest ?? ''
    saveDisplaySettings(dest, { ...readDisplaySettings(dest), [name]: name === 'grouped' ? value === 'true' : value })
  }
  const status = target.closest('.display-settings')?.querySelector('.display-settings-status')
  if (status) status.textContent = 'Saved on this device.'
  return true
}
