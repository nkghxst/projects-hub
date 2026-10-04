// The hub UI's shared state, the phone's settings and queue, and the one hook everything uses to ask for a redraw:
// app.ts registers the renderer with onChange(), and views and actions call changed() instead of importing it.
import { noteId, stableId } from './core.js'
                                                              
import { defaultRepo } from './source.js'
                                                                           

                                                                             
                                       
                                                                                                    
// A note saved on the phone and not yet on GitHub. Its ID and path are fixed when it's saved, so a retry can't
// duplicate it; `dest` is the repository it was written for, and it's only ever sent there.
                      
            
              
              
              
                
               
                 
              
                   
                   
 

export const REFRESH_MS = 2 * 60 * 1000
export const DEFAULT_FILTERS          = { machine: 'all', query: '', sort: 'checkpoint' }
export const EMPTY_DRAFT        = { kind: 'note', project: '', title: '', body: '', source: '' }

export function readJson   (key        , fallback   )    {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw)     )
  } catch {
    return fallback
  }
}

export const settings                 = {
  token: '',
  repo: '',
  apiBase: 'https://api.github.com',
  ...readJson                         ('hub.github', {}),
}
export const isConfigured = () => settings.token.trim() !== '' && /^[\w.-]+\/[\w.-]+$/.test(settings.repo.trim())

// ---------- the send queue: one storage entry per note ----------
// Each note is its own entry, so two windows saving at once can't overwrite each other: adding or removing a note
// touches only that note's entry, never a shared list.

export const QUEUE_PREFIX = 'hub.q.'

export function readQueue()           {
  const items           = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(QUEUE_PREFIX)) continue
    try {
      items.push(JSON.parse(localStorage.getItem(key) ?? '')          )
    } catch {
      // A damaged entry is left alone rather than lost.
    }
  }
  return items.sort((a, b) => a.createdAt - b.createdAt)
}

export const isQueued = (id        ) => localStorage.getItem(QUEUE_PREFIX + id) !== null

export function putQueued(item        ) {
  localStorage.setItem(QUEUE_PREFIX + item.id, JSON.stringify(item))
}

export function dropQueued(id        ) {
  localStorage.removeItem(QUEUE_PREFIX + id)
}

// Notes saved by an earlier version carry no record of which repository they were written for. They're marked with
// this destination, which never matches a real one, so they're held until the owner chooses where they go.
export const UNKNOWN_DEST = 'unknown'

// Earlier versions kept the queue as one array under 'hub.queue' and one snapshot for every repository. Each old note
// moves into its own entry under a stable ID made from its full path and content, so running this again (another
// window, or after a crash part-way) rewrites the same entries rather than duplicating or colliding. The old array is
// only removed once every note is confirmed in its new entry; if storage fills up, it stays for the next attempt. The
// old shared snapshot can't say which repository it came from, so it's dropped (it's only a cache).
function migrateStorage() {
  const old = readJson                                      ('hub.queue', null)
  if (old) {
    try {
      const ids = old.map(q => `legacy-${stableId(`${q.path}\n${q.text}`)}`)
      old.forEach((q, i) => {
        if (!isQueued(ids[i])) putQueued({ ...q, id: ids[i], dest: UNKNOWN_DEST })
      })
      if (ids.every(isQueued)) localStorage.removeItem('hub.queue')
    } catch {
      // Storage full or unavailable: keep the old queue as it is and try again next time.
    }
  }
  localStorage.removeItem('hub.gh.snapshot')
}
migrateStorage()

// A new queue ID that isn't already in use on this device.
export function newQueueId()         {
  let id = noteId()
  while (isQueued(id)) id = noteId()
  return id
}

// ---------- state ----------

export const state = {
  mode: 'local'                      ,
  source: null                 ,
  // Bumped whenever Settings or a reset replaces the source, so work started for the old one stops; the abort
  // controller cancels its requests still in flight.
  sourceGeneration: 0,
  abort: new AbortController(),
  data: null               ,
  loadedAt: 0,
  error: '',
  isOffline: false,
  filters: { ...DEFAULT_FILTERS, machine: readJson                  ('hub.filters', {}).machine ?? 'all', sort: readJson                  ('hub.filters', {}).sort ?? 'checkpoint' }           ,
  // Projects pinned to the top of the home, on this device.
  pins: new Set(readJson          ('hub.pins', [])),
  // Which folding areas (Activity, Done) are open, kept across redraws.
  openDetails: new Set        (),
  nextMore: false,
  layout: (localStorage.getItem('hub.layout') === 'raw' ? 'raw' : 'readable')          ,
  record: null                     ,
  // The source the open record came from, so a record from one repository is never kept under another.
  recordDest: '',
  recordError: '',
  open: new Set        (),
  liveMore: false,
  pending: new Set        (),
  notes: []          ,
  inboxKind: 'all'                    ,
  queue: readQueue(),
  queueError: '',
  draft: { ...EMPTY_DRAFT }         ,
  // What's being typed into Settings, kept across redraws until it's saved. A first run starts with the usual repo.
  settingsDraft: { ...settings, repo: settings.repo || defaultRepo() }                  ,
  settingsMessage: '',
  // The browser offered to install the app (Android Chrome), or it's already running installed.
  canInstall: false,
  isInstalled: false,
}

export function refreshQueue() {
  state.queue = readQueue()
}

export const errorText = (error         ) => (error instanceof Error ? error.message : String(error))

let redraw = () => {}
export function onChange(render            ) {
  redraw = render
}
export function changed() {
  redraw()
}

export function toast(text        ) {
  const el = document.getElementById('toast')               
  el.textContent = text
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2800)
}
