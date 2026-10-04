// What the hub does: load data, send queued notes, summarise, save drafts and settings, filter, and follow routes.
// Each action changes state and calls changed() for a redraw.
import { formatNote, isWebUrl, looksLikeSecret } from './core.js'
                                                  
import { captureHref, currentRoute, recordHref } from './routes.js'
import { githubSource, snapshotAge, snapshotKeys, snapshotProjects } from './source.js'
import {
  changed,
  dropQueued,
  EMPTY_DRAFT,
  errorText,
  isConfigured,
  isQueued,
  putQueued,
  QUEUE_PREFIX,
  readQueue,
  refreshQueue,
  settings,
  state,
  toast,
} from './state.js'
                                                 

export async function loadAll() {
  const source = state.source
  if (!source) return
  const generation = state.sourceGeneration
  try {
    const data = await source.projects()
    if (generation !== state.sourceGeneration) return
    state.data = data
    state.loadedAt = Date.now()
    state.error = ''
    state.isOffline = false
  } catch (error) {
    if (generation !== state.sourceGeneration) return
    state.error = errorText(error)
    // On the phone, fall back to this repository's saved copy so projects still read offline.
    if (state.mode === 'github' && error instanceof Error && error.name === 'offline') {
      const snap = snapshotProjects(settings)
      if (snap) {
        state.data = snap
        state.isOffline = true
        state.loadedAt = snapshotAge(settings) ?? 0
      }
    }
  }
  try {
    const notes = await source.notes()
    if (generation === state.sourceGeneration) state.notes = notes
  } catch {
    // Keep the notes already shown.
  }
}

// Each load gets a number; a reply that arrives after a newer load started is dropped, so a slow record can't
// replace the one opened after it. Reloading the record already shown (a refresh) keeps its open sections.
let recordRequest = 0
export async function loadRecord(path        ) {
  const request = ++recordRequest
  const isSameRecord = state.record?.path === path
  try {
    if (!state.source) throw new Error('not connected')
    const record = await state.source.record(path)
    if (request !== recordRequest) return
    state.record = record
    state.recordError = ''
    if (isSameRecord) {
      state.open = new Set([...state.open].filter(k => Number(k) < record.sections.length))
    } else {
      state.open = new Set(record.sections.length > 0 ? ['0'] : [])
      state.liveMore = false
      state.pending = new Set()
    }
  } catch (error) {
    if (request !== recordRequest) return
    // A failed refresh keeps the record on screen; a failed navigation says why.
    if (!isSameRecord) state.recordError = `Couldn't open ${path}: ${errorText(error)}`
  }
}

// Sends the current repository's waiting notes in order and stops at the first failure, saying why. Safe to call any
// time: a call that arrives while a send is running gets another pass. Only one window sends at a time where the
// browser supports locks; each note is checked to still be waiting just before it goes, and a duplicate send by
// another window resolves as delivered (same content) rather than doubling up.
let isFlushing = false
let isFlushWanted = false
export async function flushQueue() {
  const source = state.source
  const create = source?.createFile
  if (!source || !create) return
  if (isFlushing) {
    isFlushWanted = true
    return
  }
  isFlushing = true
  const generation = state.sourceGeneration
  let sent = 0
  const sendAll = async () => {
    do {
      isFlushWanted = false
      for (const q of readQueue().filter(item => item.dest === source.dest && !item.conflict)) {
        if (generation !== state.sourceGeneration) return
        if (!isQueued(q.id)) continue
        try {
          await create(q.path, q.text, `Phone ${q.kind}: ${q.title}`)
          dropQueued(q.id)
          sent++
          state.queueError = ''
        } catch (error) {
          if (error instanceof Error && error.name === 'conflict') {
            putQueued({ ...q, conflict: error.message })
            state.queueError = error.message
            continue
          }
          state.queueError =
            error instanceof Error && error.name === 'offline' ? "Offline: they'll send when you're back online." : errorText(error)
          isFlushWanted = false
          return
        }
      }
    } while (isFlushWanted && generation === state.sourceGeneration)
  }
  try {
    const locks = (navigator                                       ).locks
    if (locks) await locks.request('hub-send', sendAll)
    else await sendAll()
  } finally {
    isFlushing = false
  }
  refreshQueue()
  if (sent > 0 && generation === state.sourceGeneration) {
    toast(sent === 1 ? 'Sent to GitHub' : `${sent} notes sent to GitHub`)
    await loadAll()
  }
  changed()
}

export function setFilters(change                  ) {
  state.filters = { ...state.filters, ...change }
  const { query: _query, ...kept } = state.filters
  localStorage.setItem('hub.filters', JSON.stringify(kept))
  changed()
}

export async function route() {
  const r = currentRoute()
  if (r.name === 'record') {
    // A different record shows "Loading…" rather than the previous one while it's fetched.
    if (state.record?.path !== r.path) {
      state.record = null
      state.recordError = ''
    }
    changed()
    await loadRecord(r.path)
    window.scrollTo(0, 0)
  } else if (r.name === 'capture' && r.project) {
    state.draft = { ...state.draft, kind: 'note', project: r.project }
  } else if (r.name === 'settings') {
    state.settingsDraft = { ...state.settingsDraft }
  }
  changed()
}

export async function refresh() {
  await flushQueue()
  await loadAll()
  const r = currentRoute()
  if (r.name === 'record') await loadRecord(r.path)
  changed()
}

export async function summarise(index        , isRedo         ) {
  const doc = state.record
  const ask = state.source?.summarise
  if (!doc || !ask || state.pending.has(index)) return
  const path = doc.path
  state.pending.add(index)
  changed()
  try {
    const reply = await ask(path, index, isRedo)
    // Only apply it if the same record is still open.
    if (reply.ok && reply.summary && state.record?.path === path) {
      state.record.sections[index].summary = reply.summary           
    } else if (!reply.ok) {
      toast(`Couldn't summarise: ${reply.error ?? 'unknown error'}`)
    }
  } catch (error) {
    toast(`Couldn't summarise: ${errorText(error)}`)
  } finally {
    state.pending.delete(index)
    changed()
  }
}

export async function saveDraft() {
  const d = state.draft
  const hasLink = isWebUrl(d.source)
  if (d.body.trim() === '' && !hasLink) return toast('Write something, or add a link')
  if (d.source.trim() && !hasLink) return toast('The link needs to start with http:// or https://')
  if (d.kind === 'note' && !d.project) return toast('Choose a project, or switch to Idea')
  if (looksLikeSecret(`${d.title}\n${d.body}\n${d.source}`)) {
    return toast("That looks like a password or token, so it wasn't saved. Notes go to GitHub.")
  }
  const source = state.source
  if (!source?.createFile) return toast('Connect to GitHub in Settings first')
  const file = formatNote(d, Date.now())
  const title = (d.title.trim() || d.body.trim().split('\n')[0] || d.source.trim()).slice(0, 80)
  const project = d.kind === 'note' ? d.project : ''
  putQueued({ id: file.id, dest: source.dest, path: file.path, text: file.text, kind: d.kind, title, project, body: d.body.trim(), createdAt: Date.now() })
  refreshQueue()
  state.draft = { ...EMPTY_DRAFT, kind: d.kind }
  toast('Saved on this phone')
  location.hash = project ? recordHref(project) : '#/inbox'
  await flushQueue()
}

export function clearDraft() {
  state.draft = { ...EMPTY_DRAFT, kind: state.draft.kind }
  changed()
}

export function setDraftKind(kind          ) {
  state.draft.kind = kind
  changed()
}

export async function saveSettings() {
  const value = (id        , fallback        ) => (document.getElementById(id)                           )?.value.trim() ?? fallback
  settings.repo = value('set-repo', state.settingsDraft.repo)
  settings.token = value('set-token', state.settingsDraft.token)
  settings.apiBase = value('set-api', state.settingsDraft.apiBase) || 'https://api.github.com'
  localStorage.setItem('hub.github', JSON.stringify(settings))
  state.settingsDraft = { ...settings }
  if (!isConfigured()) {
    state.settingsMessage = 'Fill in the repository as owner/name, and the token.'
    return changed()
  }
  // A new destination: stop work for the old one and clear what it showed.
  state.sourceGeneration++
  state.source = githubSource(settings)
  state.data = null
  state.notes = []
  state.record = null
  state.isOffline = false
  state.error = ''
  state.settingsMessage = 'Connecting…'
  changed()
  await loadAll()
  if (state.isOffline) {
    state.settingsMessage = `Offline: showing the saved copy of ${settings.repo} from ${new Date(state.loadedAt).toLocaleString('en-GB')}. It will connect when there's a signal.`
  } else if (state.error) {
    state.settingsMessage = state.error
  } else {
    state.settingsMessage = `Connected to ${settings.repo}: ${state.data?.projects.length ?? 0} projects, ${state.notes.length} notes.`
    await flushQueue()
  }
  changed()
}

export function forgetToken() {
  settings.token = ''
  localStorage.setItem('hub.github', JSON.stringify(settings))
  state.settingsDraft = { ...settings }
  state.sourceGeneration++
  state.source = null
  state.settingsMessage = 'Token removed from this phone. Saved notes and the offline copy are still here.'
  changed()
}

// Everything the app keeps on this device: settings, token, unsent notes, offline copies, preferences.
export function removeAllData() {
  const unsent = readQueue().length
  const warning = unsent > 0 ? `\n\n${unsent} note${unsent === 1 ? " hasn't" : "s haven't"} been sent yet and will be lost.` : ''
  if (!confirm(`Remove the token, settings, offline copies and unsent notes from this device?${warning}`)) return
  const keys           = [...snapshotKeys()]
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith(QUEUE_PREFIX) || key.startsWith('hub.'))) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
  if ('caches' in globalThis) void caches.keys().then(names => names.forEach(n => void caches.delete(n)))
  Object.assign(settings, { token: '', repo: '', apiBase: 'https://api.github.com' })
  state.settingsDraft = { ...settings }
  state.sourceGeneration++
  state.source = null
  state.data = null
  state.notes = []
  state.record = null
  refreshQueue()
  state.settingsMessage = 'All hub data has been removed from this device.'
  changed()
}

// Notes held for a repository other than the current one: send them here instead (explicitly), or discard them.
export async function sendHeldHere(id        ) {
  const item = readQueue().find(q => q.id === id)
  const dest = state.source?.dest
  if (!item || !dest) return
  if (!confirm(`Send "${item.title}" to ${settings.repo} instead of the repository it was written for?`)) return
  putQueued({ ...item, dest, conflict: undefined })
  refreshQueue()
  await flushQueue()
}

export function discardQueued(id        ) {
  const item = readQueue().find(q => q.id === id)
  if (!item || !confirm(`Discard "${item.title}"? It hasn't been sent anywhere, so this can't be undone.`)) return
  dropQueued(id)
  refreshQueue()
  changed()
}

export const queuedText = (id        ) => readQueue().find(q => q.id === id)?.text ?? ''

// Android's share menu opens the app with ?title=&text=&url=; turn that into a draft.
export function takeShare() {
  const params = new URLSearchParams(location.search)
  if (!params.has('title') && !params.has('text') && !params.has('url')) return
  const text = params.get('text') ?? ''
  const url = params.get('url') ?? (/^https?:\/\/\S+$/.test(text.trim()) ? text.trim() : '')
  state.draft = {
    ...EMPTY_DRAFT,
    kind: 'idea',
    title: params.get('title') ?? '',
    body: url && text.trim() === url ? '' : text,
    source: url,
  }
  history.replaceState(null, '', `${location.pathname}${captureHref()}`)
}

                      
