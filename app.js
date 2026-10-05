// Projects hub web UI. The same page runs on the desktop (served by app/server.ts, reading the local clone, with
// live Codeg work and summaries) and on the phone (published on GitHub Pages, reading claude-profile from GitHub
// and capturing notes). Which one it is comes from whether the hub server answers.
// This file draws the page and wires up events; views, state and actions live in their own modules.
import { fmtStamp, pad } from './core.js'
                                                                   
import { escapeHtml as esc, glossaryEntries, setGlossary } from './markdown.js'
import {
  clearDraft,
  closePickUp,
  copyPickUp,
  openPickUp,
  sharePickUp,
  markAllChangesSeen,
  markChangeSeen,
  showChanges,
  askFromNote,
  askFromRecord,
  askFromSearch,
  copyAnswer,
  runAsk,
  setAskKind,
  toggleAskPick,
  closeShare,
  connectGitHub,
  copyShare,
  currentShare,
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
  setHandled,
  setShareKind,
  shareNow,
  openShare,
  setDraftKind,
  setFilters,
  summarise,
  takeShare,
} from './actions.js'
import { captureHref, currentRoute } from './routes.js'
import { EPOCH_KEY, localSource, snapshotSaveProblem } from './source.js'
import { changed, isConfigured, onChange, openNotes, QUEUE_PREFIX, REFRESH_MS, refreshQueue, state, toast } from './state.js'
                                         
import { renderCapture, renderInbox, renderSettings } from './view-forms.js'
import { renderList } from './view-list.js'
import { renderSetup } from './view-setup.js'
import { renderUsageBar } from './view-usage.js'
import { renderRecord } from './view-record.js'
import { renderAsk } from './view-ask.js'
import { renderChanges } from './view-changes.js'
import { shareSummary, shareTextHtml } from './view-share.js'

// The desktop launcher adds ?stale=1 when it couldn't restart a server running old code.
const isStaleServer = new URLSearchParams(location.search).get('stale') === '1'

const view = document.getElementById('view')               
// Banners (loading problems, offline, storage) sit in a polite live region, so a screen reader hears them change.
const bannerBox = document.getElementById('banners')               
const nav = document.getElementById('nav')               
const tabbar = document.getElementById('tabbar')               
const loadedLabel = document.getElementById('loaded')               
const usageBar = document.getElementById('usagebar')               

// Open notes plus ones still waiting to send: what the Inbox count shows.
const inboxCount = () => openNotes().length + state.queue.length

// The top bar. On a phone, Inbox and New move to the bottom bar (CSS hides the "wide" ones), leaving Settings and
// Refresh up here.
function renderNav() {
  const count = inboxCount()
  const route = currentRoute().name
  nav.innerHTML = `
    <a class="button wide" href="#/inbox" title="Notes and ideas"${route === 'inbox' ? ' aria-current="page"' : ''}>Inbox${count > 0 ? ` (${count})` : ''}</a>
    ${state.source?.createFile ? `<a class="button primary wide" href="${captureHref()}">✎ Note</a>` : ''}
    ${state.mode === 'github' ? `<a class="button" href="#/settings" title="Settings" aria-label="Settings"${route === 'settings' ? ' aria-current="page"' : ''}>⚙</a>` : ''}
    <button data-action="refresh" title="Refresh (shortcut: r)" aria-label="Refresh">↻</button>`
}

// The phone's bottom bar, within thumb reach: Projects, Inbox, New and Search. CSS shows it on narrow screens only and
// hides it while capturing, when the keyboard needs the room.
function renderTabbar() {
  const route = currentRoute().name
  const count = inboxCount()
  const tab = (href        , icon        , label        , isOn         ) =>
    `<a href="${href}"${isOn ? ' aria-current="page"' : ''}><span class="tab-icon" aria-hidden="true">${icon}</span>${label}</a>`
  tabbar.innerHTML = `
    ${tab('#/', '▦', 'Projects', route === 'list' || route === 'record')}
    ${tab('#/inbox', '✉', count > 0 ? `Inbox <span class="tab-count">${count}</span>` : 'Inbox', route === 'inbox')}
    ${state.source?.createFile ? tab(captureHref(), '✎', 'New', route === 'capture') : ''}
    <button type="button" data-action="search"><span class="tab-icon" aria-hidden="true">⌕</span>Search</button>`
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
  setGlossary(state.data?.glossary ?? [])
  const focus = focusSnapshot()
  const isUsageFocused = (document.activeElement                      )?.dataset?.action === 'usage-toggle'
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
  } else if (r.name === 'ask') {
    html = renderAsk()
  } else if (r.name === 'changes') {
    html = renderChanges()
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
  renderTabbar()
  usageBar.innerHTML = renderUsageBar(state.data?.usage, state.data?.now ?? Date.now())
  document.body.dataset.route = r.name

  const at = new Date(state.loadedAt)
  loadedLabel.textContent = state.loadedAt ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : ''
  loadedLabel.title = state.loadedAt ? `Loaded ${at.toLocaleString('en-GB')}; refreshes every 2 min` : ''

  renderTermPop()
  restoreFocus(focus)
  // The usage button is redrawn with the bar; keep keyboard focus on it.
  if (isUsageFocused) (document.querySelector('[data-action="usage-toggle"]')                      )?.focus()
}
onChange(render)

// A glossary term explains itself when tapped or chosen with Enter (hovering shows it too, on a desktop): under the
// term, until it's closed with its button, Escape, a tap elsewhere or a page change. Not a toast, which timed out and
// followed the reader onto other pages (Codex M5 review).
const termPop = document.getElementById('term-pop')               
function renderTermPop(anchor                     ) {
  const entries = state.term ? glossaryEntries(state.term) : []
  termPop.hidden = entries.length === 0
  termPop.innerHTML =
    entries.length === 0
      ? ''
      : '<button type="button" class="link muted term-close" data-action="term-close" aria-label="Close the explanation">✕</button>' +
        entries
          .map(
            t =>
              `<p><strong>${esc(t.term)}</strong>${t.scope ? ` <span class="muted">(${esc(t.scope)})</span>` : ''}: ${esc(t.meaning)}` +
              `${t.source ? `<br><span class="muted small">Source: ${esc(t.source)}</span>` : ''}</p>`,
          )
          .join('')
  const rect = anchor?.getBoundingClientRect?.()
  if (rect && termPop.style && entries.length > 0) {
    const width = Math.min(360, window.innerWidth - 24)
    termPop.style.width = `${width}px`
    termPop.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + window.scrollX}px`
    termPop.style.top = `${rect.bottom + window.scrollY + 6}px`
  }
}
function explainTerm(el                    ) {
  const name = el?.dataset?.term
  if (!name || glossaryEntries(name).length === 0) return
  state.term = state.term === name ? null : name
  renderTermPop(el)
}
function closeTerm() {
  if (state.term === null) return false
  state.term = null
  renderTermPop()
  return true
}

document.addEventListener('click', async event => {
  const term = (event.target               ).closest?.('.term')                      
  if (term) explainTerm(term)
  else if (!(event.target               ).closest?.('#term-pop')) closeTerm()
  const target = (event.target               ).closest('[data-action]')                      
  // A click anywhere outside the usage bar closes its panel.
  if (state.usageOpen && !(event.target               ).closest('#usagebar')) {
    state.usageOpen = false
    changed()
  }
  if (!target) return
  const action = target.dataset.action
  const value = target.dataset.value ?? ''
  if (action === 'machine') setFilters({ machine: value                       })
  else if (action === 'clear') setFilters({ machine: 'all', query: '' })
  else if (action === 'share-open') openShare({ target: 'section', index: Number(value) })
  else if (action === 'share-note') openShare({ target: 'note', note: value })
  else if (action === 'share-kind') setShareKind(value             )
  else if (action === 'share-send') await shareNow()
  else if (action === 'share-copy') await copyShare()
  else if (action === 'ask-search') askFromSearch()
  else if (action === 'ask-record') askFromRecord()
  else if (action === 'ask-note') askFromNote(value)
  else if (action === 'ask-pick') toggleAskPick(Number(value))
  else if (action === 'ask-kind') setAskKind(value           )
  else if (action === 'ask-run') await runAsk()
  else if (action === 'ask-copy') await copyAnswer()
  else if (action === 'term-close') closeTerm()
  else if (action === 'pickup-open') state.pickUp ? closePickUp() : openPickUp()
  else if (action === 'pickup-close') closePickUp()
  else if (action === 'pickup-copy') await copyPickUp()
  else if (action === 'pickup-share') await sharePickUp()
  else if (action === 'changes-show') await showChanges(value)
  else if (action === 'changes-seen') markChangeSeen(value)
  else if (action === 'changes-all-seen') markAllChangesSeen()
  else if (action === 'share-close') closeShare()
  else if (action === 'usage-toggle') {
    state.usageOpen = !state.usageOpen
    changed()
  }
  else if (action === 'mark-handled') await setHandled(value, true)
  else if (action === 'reopen') await setHandled(value, false)
  else if (action === 'search') {
    // The filter box on the home page: go there, then put the cursor in it.
    if (currentRoute().name !== 'list') location.hash = '#/'
    setTimeout(() => (document.getElementById('query')                           )?.focus(), 60)
  }
  else if (action === 'next-more') {
    state.nextMore = !state.nextMore
    changed()
  } else if (action === 'pin') {
    // Unpinning clears a pin on either record of the pair, so the project really leaves Pinned.
    const pair = target.dataset.pair ?? ''
    if (state.pins.has(value) || (pair && state.pins.has(pair))) {
      state.pins.delete(value)
      state.pins.delete(pair)
    } else state.pins.add(value)
    localStorage.setItem('hub.pins', JSON.stringify([...state.pins]))
    changed()
  }
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
  } else if (action === 'inbox-state') {
    state.inboxState = value                             
    changed()
  } else if (action === 'retry') await flushQueue()
  else if (action === 'draft-kind') setDraftKind(value            )
  else if (action === 'new-idea') setDraftKind('idea')
  else if (action === 'clear-draft') clearDraft()
  else if (action === 'forget-token') forgetToken()
  else if (action === 'remove-all') await removeAllData()
  else if (action === 'paste-connect') await pasteAndConnect()
  else if (action === 'install' && installPrompt) {
    // The browser's prompt can only be used once; after it, the setup screen goes back to the menu instructions.
    const prompt = installPrompt
    installPrompt = null
    state.canInstall = false
    await prompt.prompt()
    changed()
  }
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
  else if (el.id === 'ask-question' && state.ask && state.ask.status !== 'running') state.ask.question = el.value
  else if (el.id === 'share-question' && state.share) {
    // The preview follows the question as it's typed, without redrawing the field.
    state.share.question = el.value
    const prompt = currentShare()
    const preview = document.getElementById('share-text')
    if (preview) preview.innerHTML = prompt ? shareTextHtml(prompt.text) : ''
    const size = document.getElementById('share-size')
    if (size) size.textContent = prompt ? shareSummary(prompt) : ''
  }
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

// Folding areas remember whether they're open, so a refresh doesn't close them ('toggle' doesn't bubble).
document.addEventListener(
  'toggle',
  event => {
    const el = event.target                      
    const key = el.dataset?.key
    if (!key) return
    if (el.open) state.openDetails.add(key)
    else state.openDetails.delete(key)
  },
  true,
)

document.addEventListener('change', event => {
  const el = event.target               
  if (el.id === 'sort') setFilters({ sort: (el                     ).value         })
  else if (el.id === 'draft-project') state.draft.project = (el                     ).value
})

document.addEventListener('keydown', event => {
  const el = event.target               
  if (event.key === 'Enter' && el.classList?.contains('term')) {
    explainTerm(el)
    return
  }
  if (event.key === 'Escape' && closeTerm()) return
  if (event.key === 'Enter' && el.id === 'ask-question') {
    event.preventDefault()
    void runAsk()
    return
  }
  // Ctrl+K (⌘K on a Mac): search, from anywhere.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (currentRoute().name !== 'list') location.hash = '#/'
    setTimeout(() => (document.getElementById('query')                           )?.focus(), 60)
    return
  }
  if (event.key === 'Escape' && state.usageOpen) {
    state.usageOpen = false
    changed()
    return
  }
  if (el.matches('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return
  const r = currentRoute()
  if (event.key === 'r') void refresh()
  else if (event.key === 'b' && r.name !== 'list') history.back()
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
