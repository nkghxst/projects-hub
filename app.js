// Projects hub web UI. The same page runs on the desktop (served by app/server.ts, reading the local clone, with
// live Codeg work and summaries) and on the phone (published on GitHub Pages, reading claude-profile from GitHub
// and capturing notes). Which one it is comes from whether the hub server answers.
// This file draws the page and wires up events; views, state and actions live in their own modules.
import { fmtStamp, pad } from './core.js'
                                               
import { escapeHtml as esc } from './markdown.js'
import {
  clearDraft,
  connectGitHub,
  discardQueued,
  flushQueue,
  forgetToken,
  loadAll,
  pasteAndConnect,
  queuedText,
  refresh,
  removeAllData,
  route,
  saveDraft,
  saveSettings,
  sendHeldHere,
  setDraftKind,
  setFilters,
  summarise,
  takeShare,
} from './actions.js'
import { captureHref, currentRoute } from './routes.js'
import { EPOCH_KEY, localSource, snapshotSaveProblem } from './source.js'
import { changed, isConfigured, onChange, QUEUE_PREFIX, REFRESH_MS, refreshQueue, state, toast } from './state.js'
                                         
import { renderCapture, renderInbox, renderSettings } from './view-forms.js'
import { renderList } from './view-list.js'
import { renderSetup } from './view-setup.js'
import { renderRecord } from './view-record.js'

// The desktop launcher adds ?stale=1 when it couldn't restart a server running old code.
const isStaleServer = new URLSearchParams(location.search).get('stale') === '1'

const view = document.getElementById('view')               
// Banners (loading problems, offline, storage) sit in a polite live region, so a screen reader hears them change.
const bannerBox = document.getElementById('banners')               
const nav = document.getElementById('nav')               
const loadedLabel = document.getElementById('loaded')               

function renderNav() {
  const inboxCount = state.notes.length + state.queue.length
  nav.innerHTML = `
    <a class="button" href="#/inbox" title="Notes and ideas from the phone"${currentRoute().name === 'inbox' ? ' aria-current="page"' : ''}>Inbox${inboxCount > 0 ? ` (${inboxCount})` : ''}</a>
    ${state.source?.createFile ? `<a class="button primary" href="${captureHref()}">✎ Note</a>` : ''}
    ${state.mode === 'github' ? `<a class="button" href="#/settings" title="Settings" aria-label="Settings"${currentRoute().name === 'settings' ? ' aria-current="page"' : ''}>⚙</a>` : ''}
    <button data-action="refresh" title="Refresh (shortcut: r)" aria-label="Refresh">↻</button>`
}

// A redraw (say, data arriving mid-typing) keeps the cursor where it was: same field, same selection.
function focusSnapshot() {
  const el = document.activeElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.id) return null
  // Only these keep a text cursor; selects and other input types have none.
  const hasCursor = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'password'].includes(el.type))
  const field = el                    
  return { id: el.id, start: hasCursor ? field.selectionStart : null, end: hasCursor ? field.selectionEnd : null }
}

function restoreFocus(snap                                  ) {
  if (!snap) return
  const el = document.getElementById(snap.id)                                                 
  if (!el) return
  el.focus()
  if (snap.start !== null && snap.end !== null) {
    try {
      el.setSelectionRange(snap.start, snap.end)
    } catch {
      // Not a text field.
    }
  }
}

function render() {
  const focus = focusSnapshot()
  const r = currentRoute()

  let html = ''
  if (state.mode === 'github' && !isConfigured()) {
    html = renderSetup()
  } else if (r.name === 'settings') {
    html = renderSettings()
  } else if (r.name === 'inbox') {
    html = renderInbox()
  } else if (r.name === 'capture') {
    html = renderCapture()
  } else if (r.name === 'record') {
    html = state.recordError
      ? `<p class="error">${esc(state.recordError)}</p><p><a href="#/">← All projects</a></p>`
      : state.record
        ? renderRecord(state.record, state.data)
        : '<p class="muted">Loading…</p>'
  } else if (state.data) {
    html = renderList(state.data, view.clientWidth)
  } else {
    html = state.error ? `<p class="error">${esc(state.error)}</p>` : '<p class="muted">Loading…</p>'
  }
  const banners = [
    isStaleServer
      ? "This hub server is running old code and couldn't be restarted automatically. Close the Node.js process in Task Manager, then click the Projects hub shortcut again."
      : '',
    state.isOffline ? `Offline: showing projects as of ${fmtStamp(state.loadedAt, Date.now())}.` : '',
    !state.isOffline && state.error && state.data && r.name === 'list' ? `Last refresh failed: ${state.error}` : '',
    state.mode === 'github' ? snapshotSaveProblem() : '',
  ].filter(Boolean)
  const bannerHtml = banners.map(b => `<p class="banner">${esc(b)}</p>`).join('')
  // Only rewritten when it changes, so the live region doesn't repeat itself on every redraw.
  if (bannerBox.innerHTML !== bannerHtml) bannerBox.innerHTML = bannerHtml
  view.innerHTML = html
  renderNav()

  const at = new Date(state.loadedAt)
  loadedLabel.textContent = state.loadedAt ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : ''
  loadedLabel.title = state.loadedAt ? `Loaded ${at.toLocaleString('en-GB')}; refreshes every 2 min` : ''

  restoreFocus(focus)
}
onChange(render)

document.addEventListener('click', async event => {
  const target = (event.target               ).closest('[data-action]')                      
  if (!target) return
  const action = target.dataset.action
  const value = target.dataset.value ?? ''
  if (action === 'machine') setFilters({ machine: value                       })
  else if (action === 'attention') setFilters({ attention: !state.filters.attention })
  else if (action === 'clear') setFilters({ machine: 'all', attention: false, query: '' })
  else if (action === 'refresh') await refresh()
  else if (action === 'back') history.length > 1 ? history.back() : (location.hash = '#/')
  else if (action === 'live-more') {
    state.liveMore = !state.liveMore
    changed()
  } else if (action === 'summarise') {
    await summarise(Number(value), target.dataset.redo === '1')
  } else if (action === 'section') {
    if (state.open.has(value)) state.open.delete(value)
    else state.open.add(value)
    changed()
  } else if (action === 'toggle-all' && state.record) {
    const all = state.record.sections.map((_, i) => String(i))
    state.open = all.every(k => state.open.has(k)) ? new Set() : new Set(all)
    changed()
  } else if (action === 'layout') {
    state.layout = state.layout === 'readable' ? 'raw' : 'readable'
    localStorage.setItem('hub.layout', state.layout)
    changed()
  } else if (action === 'inbox-kind') {
    state.inboxKind = value                    
    changed()
  } else if (action === 'retry') await flushQueue()
  else if (action === 'draft-kind') setDraftKind(value            )
  else if (action === 'new-idea') setDraftKind('idea')
  else if (action === 'clear-draft') clearDraft()
  else if (action === 'forget-token') forgetToken()
  else if (action === 'remove-all') await removeAllData()
  else if (action === 'paste-connect') await pasteAndConnect()
  else if (action === 'install') await installPrompt?.prompt()
  else if (action === 'send-here') await sendHeldHere(value)
  else if (action === 'discard') discardQueued(value)
  else if (action === 'copy' || action === 'copy-queued') {
    try {
      await navigator.clipboard.writeText(action === 'copy' ? (target.dataset.text ?? '') : queuedText(value))
      toast('Copied')
    } catch {
      toast("Couldn't copy here")
    }
  }
})

document.addEventListener('submit', event => {
  const form = event.target                   
  event.preventDefault()
  if (form.id === 'capture') void saveDraft()
  else if (form.id === 'settings') void saveSettings()
})

// Typing updates state without redrawing, so the field keeps its focus; the filter box is the exception.
document.addEventListener('input', event => {
  const el = event.target                    
  if (el.id === 'query') setFilters({ query: el.value })
  else if (el.id === 'draft-title') state.draft.title = el.value
  else if (el.id === 'draft-body') state.draft.body = el.value
  else if (el.id === 'draft-source') state.draft.source = el.value
  else if (el.id === 'set-repo') state.settingsDraft.repo = el.value
  else if (el.id === 'set-token') state.settingsDraft.token = el.value
  else if (el.id === 'set-api') state.settingsDraft.apiBase = el.value
})

// Another window of the app reset it, or changed or forgot the token: start again from what's saved now, so this
// window can't keep reading or sending with the old settings. Another window changed the queue: show it, and send if
// this window is the one that can.
window.addEventListener('storage', event => {
  if (event.key === null || event.key === EPOCH_KEY || event.key === 'hub.github') {
    location.reload()
  } else if (event.key.startsWith(QUEUE_PREFIX)) {
    refreshQueue()
    changed()
    void flushQueue()
  }
})

document.addEventListener('change', event => {
  const el = event.target               
  if (el.id === 'sort') setFilters({ sort: (el                     ).value         })
  else if (el.id === 'draft-project') state.draft.project = (el                     ).value
})

document.addEventListener('keydown', event => {
  const el = event.target               
  if (el.matches('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return
  const r = currentRoute()
  if (event.key === 'r') void refresh()
  else if (event.key === 'b' && r.name !== 'list') history.back()
  else if (event.key === 'a' && r.name === 'list') setFilters({ attention: !state.filters.attention })
  else if (event.key === '/' && r.name === 'list') {
    event.preventDefault()
    ;(document.getElementById('query')                           )?.focus()
  }
})

// Android Chrome offers to install the app; setup shows its own Install button instead of the browser's banner.
                                                            
let installPrompt                       = null
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  installPrompt = event                 
  state.canInstall = true
  changed()
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
  state.canInstall = false
  state.isInstalled = true
  changed()
})
state.isInstalled = globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false

window.addEventListener('hashchange', () => void route())
window.addEventListener('online', () => void refresh())
window.addEventListener('resize', () => {
  if (currentRoute().name === 'list') render()
})

// The desktop hub server answers /api/health; GitHub Pages (or any static host) doesn't. The server only
// accepts localhost, so anywhere else there's no need to ask.
async function detectMode()                              {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return 'github'
  try {
    const res = await fetch('./api/health', { cache: 'no-store' })
    if (res.ok && ((await res.json())                    ).ok) return 'local'
  } catch {
    // Not the hub server.
  }
  return 'github'
}

state.mode = await detectMode()
document.body.dataset.mode = state.mode
if (state.mode === 'local') {
  state.source = localSource()
} else {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
  if (isConfigured()) state.source = connectGitHub()
  takeShare()
}
setInterval(() => void refresh(), REFRESH_MS)
render()
await loadAll()
await route()
await flushQueue()
