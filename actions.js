// What the hub does: load data, send queued notes, summarise, save drafts and settings, filter, and follow routes.
// Each action changes state and calls changed() for a redraw.
import { formatNote, looksLikeSecret } from './core.js'
                                                  
import { captureHref, currentRoute, recordHref } from './routes.js'
import { githubSource, snapshotAge, snapshotProjects } from './source.js'
import { changed, EMPTY_DRAFT, errorText, isConfigured, saveQueue, settings, state, toast } from './state.js'
                                         

export async function loadAll() {
  const source = state.source
  if (!source) return
  try {
    state.data = await source.projects()
    state.loadedAt = Date.now()
    state.error = ''
    state.isOffline = false
  } catch (error) {
    state.error = errorText(error)
    // On the phone, fall back to the last snapshot so projects still read offline.
    if (state.mode === 'github' && error instanceof Error && error.name === 'offline') {
      const snap = snapshotProjects(settings)
      if (snap) {
        state.data = snap
        state.isOffline = true
        state.loadedAt = snapshotAge() ?? 0
      }
    }
  }
  try {
    state.notes = await source.notes()
  } catch {
    // Keep the notes already shown.
  }
}

export async function loadRecord(path        ) {
  state.record = null
  state.recordError = ''
  try {
    if (!state.source) throw new Error('not connected')
    state.record = await state.source.record(path)
    state.open = new Set(state.record.sections.length > 0 ? ['0'] : [])
    state.liveMore = false
    state.pending = new Set()
  } catch (error) {
    state.recordError = `Couldn't open ${path}: ${errorText(error)}`
  }
}

// Sends waiting notes in order; stops at the first failure and says why. Safe to call any time: a call that
// arrives while a send is running (a note saved during a refresh) gets another pass when that send finishes.
let isFlushing = false
let isFlushWanted = false
export async function flushQueue() {
  const create = state.source?.createFile
  if (!create || state.queue.length === 0) return
  if (isFlushing) {
    isFlushWanted = true
    return
  }
  isFlushing = true
  let sent = 0
  try {
    do {
      isFlushWanted = false
      for (const q of [...state.queue]) {
        try {
          await create(q.path, q.text, `Phone ${q.kind}: ${q.title}`)
          state.queue = state.queue.filter(x => x.path !== q.path)
          saveQueue()
          sent++
          state.queueError = ''
        } catch (error) {
          state.queueError =
            error instanceof Error && error.name === 'offline' ? "Offline: they'll send when you're back online." : errorText(error)
          isFlushWanted = false
          break
        }
      }
    } while (isFlushWanted && state.queue.length > 0)
  } finally {
    isFlushing = false
  }
  if (sent > 0) {
    toast(sent === 1 ? 'Note sent' : `${sent} notes sent`)
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
    // Show "Loading…" rather than the previous record while this one is fetched.
    state.record = null
    state.recordError = ''
    changed()
    await loadRecord(r.path)
    window.scrollTo(0, 0)
  } else if (r.name === 'capture' && r.project) {
    state.draft = { ...state.draft, kind: 'note', project: r.project }
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
  if (d.body.trim() === '') return toast('Write something first')
  if (d.kind === 'note' && !d.project) return toast('Choose a project, or switch to Idea')
  if (looksLikeSecret(`${d.title}\n${d.body}\n${d.source}`)) {
    return toast("That looks like a password or token, so it wasn't saved. Notes go to GitHub.")
  }
  const file = formatNote(d, Date.now())
  const title = d.title.trim() || d.body.trim().split('\n')[0].slice(0, 80)
  const project = d.kind === 'note' ? d.project : ''
  state.queue = [...state.queue, { path: file.path, text: file.text, kind: d.kind, title, project, body: d.body.trim(), createdAt: Date.now() }]
  saveQueue()
  state.draft = { ...EMPTY_DRAFT, kind: d.kind }
  toast('Saved')
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
  const value = (id        ) => (document.getElementById(id)                           )?.value.trim() ?? ''
  settings.repo = value('set-repo')
  settings.token = value('set-token')
  settings.apiBase = value('set-api') || 'https://api.github.com'
  localStorage.setItem('hub.github', JSON.stringify(settings))
  if (!isConfigured()) {
    state.settingsMessage = 'Fill in the repository as owner/name, and the token.'
    return changed()
  }
  state.source = githubSource(settings)
  state.settingsMessage = 'Connecting…'
  changed()
  await loadAll()
  if (state.error && !state.isOffline) {
    state.settingsMessage = state.error
  } else {
    state.settingsMessage = `Connected: ${state.data?.projects.length ?? 0} projects, ${state.notes.length} notes.`
    await flushQueue()
  }
  changed()
}

export function forgetToken() {
  settings.token = ''
  localStorage.setItem('hub.github', JSON.stringify(settings))
  state.source = null
  state.settingsMessage = 'Token removed from this phone.'
  changed()
}

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
