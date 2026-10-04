// The hub UI's shared state, the phone's settings and queue, and the one hook everything uses to ask for a redraw:
// app.ts registers the renderer with onChange(), and views and actions call changed() instead of importing it.
                                                              
                                                                           

                                                                                                 
                                       
                                                                                                    
// A note saved on the phone and not yet on GitHub. Its path is fixed when it's saved, so a retry can't duplicate it.
                                                                                                                                    

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

export const state = {
  mode: 'local'                      ,
  source: null                 ,
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
  queue: readJson          ('hub.queue', []),
  queueError: '',
  draft: { ...EMPTY_DRAFT }         ,
  settingsMessage: '',
}

export function saveQueue() {
  localStorage.setItem('hub.queue', JSON.stringify(state.queue))
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
