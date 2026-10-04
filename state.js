// The hub UI's shared state, the phone's settings and queue, and the one hook everything uses to ask for a redraw:
// app.ts registers the renderer with onChange(), and views and actions call changed() instead of importing it.
import { noteId } from './core.js'
                                                              
import { destinationOf } from './source.js'
                                                                           

                                                                                                 
                                       
                                                                                                    
// A note saved on the phone and not yet on GitHub. Its ID and path are fixed when it's saved, so a retry can't
// duplicate it; `dest` is the repository it was written for, and it's only ever sent there.
                      
            
              
              
              
                
               
                 
              
                   
                   
 

export const REFRESH_MS = 2 * 60 * 1000
export const DEFAULT_FILTERS          = { machine: 'all', attention: false, query: '', sort: 'checkpoint' }
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

// Earlier versions kept the queue as one array under 'hub.queue' and one snapshot for every repository. Move queued
// notes into their own entries (tied to the repository configured now, which is the one they were written for) and
// drop the old shared snapshot, which can't say which repository it came from.
function migrateStorage() {
  const old = readJson                                      ('hub.queue', null)
  if (old) {
    const dest = settings.repo.trim() ? destinationOf(settings) : ''
    for (const q of old) putQueued({ ...q, id: q.path.match(/-([0-9a-f]{8})\.md$/)?.[1] ?? noteId(), dest })
    localStorage.removeItem('hub.queue')
  }
  localStorage.removeItem('hub.gh.snapshot')
}
migrateStorage()

// ---------- state ----------

export const state = {
  mode: 'local'                      ,
  source: null                 ,
  // Bumped whenever Settings replaces the source, so work started for the old one stops.
  sourceGeneration: 0,
  data: null               ,
  loadedAt: 0,
  error: '',
  isOffline: false,
  filters: { ...DEFAULT_FILTERS, ...readJson                  ('hub.filters', {}), query: '' }           ,
  layout: (localStorage.getItem('hub.layout') === 'raw' ? 'raw' : 'readable')          ,
  record: null                     ,
  recordError: '',
  open: new Set        (),
  liveMore: false,
  pending: new Set        (),
  notes: []          ,
  inboxKind: 'all'                    ,
  queue: readQueue(),
  queueError: '',
  draft: { ...EMPTY_DRAFT }         ,
  // What's being typed into Settings, kept across redraws until it's saved.
  settingsDraft: { ...settings }                  ,
  settingsMessage: '',
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
