// Where the hub's data comes from. On the desktop, the local hub server (live Codeg work, summaries, notes as of the
// last sync). On the phone, GitHub: the private claude-profile repo read through the GraphQL API with the owner's own
// fine-grained token, and notes written through the contents API. Both give the views the same shapes.
import {
  buildProject,
  CHART_DAYS,
  commitBy,
  DAY_MS,
  dayKeyOf,
  DESKTOP_NOTES_DIR,
  formatHandledMark,
  MACHINES,
  MARK_DIRS,
  NOTE_DIRS,
  noteId,
  ownerOf,
  pairProjects,
  parseDoc,
  parseHandledMark,
  parseHosts,
  parseIndexRows,
  parseNote,
  parseUsageSnapshot,
  PHONE_DIR,
  publishedBy,
  searchRecords,
  withHandled,
} from './core.js'
                                                                                                                              

                    
             
                     
              
                                                                            
                                                         
                                                                                                      
                        
                                                             
                       
 
                                                                                               
                                                                            
                                                                             

                      
                          
                                                                                                                          
              
                               
                                               
                              
                                                                                                               
                                                                                                   
                                                                                                                 
                                                                                                        
                                                                                             
                                                                                                                
                                                                                              
                   
                                                                                     
                                                            
                                                                                                                    
                                                  
 

// An error the views can explain: 'auth' (token refused), 'offline' (no connection), 'conflict' (a different file is
// already at a note's path), 'other'.
                                                                       
export function sourceError(code                 , message        )        {
  const error = new Error(message)
  error.name = code
  return error
}

// GitHub answers 403 or 429 when it's rate-limiting; that's a pause, not a bad token.
const isRateLimited = (res          ) =>
  (res.status === 403 || res.status === 429) && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after'))

async function getJson   (url        , init              )             {
  let res          
  try {
    res = await fetch(url, init)
  } catch {
    throw sourceError('offline', 'No connection')
  }
  if (!res.ok) throw sourceError('other', `${res.status} ${res.statusText}`)
  return (await res.json())     
}

// ---------- the desktop hub server ----------

// A request that changes something: JSON, with the header the server requires of its own page.
async function postHub   (url        , body         )             {
  let res          
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub': '1' }, body: JSON.stringify(body) })
  } catch {
    throw sourceError('offline', 'The hub server is not answering')
  }
  return (await res.json().catch(() => ({ ok: false, error: `${res.status}` })))     
}

export function localSource()         {
  return {
    kind: 'local',
    dest: 'local',
    projects: () => getJson      ('/api/projects'),
    record: path => getJson            (`/api/record?path=${encodeURIComponent(path)}`),
    notes: async () => (await getJson                   ('/api/notes')).notes,
    notesDir: DESKTOP_NOTES_DIR,
    search: async query => (await getJson                       (`/api/search?q=${encodeURIComponent(query)}`)).hits,
    // The desktop app writes through the hub server, into this clone's memory/desktop/; sync.sh publishes it.
    createFile: async (path, text) => {
      const reply = await postHub                                                                ('/api/capture', { path, text })
      if (!reply.ok) throw sourceError(reply.error === 'conflict' ? 'conflict' : 'other', reply.error === 'conflict' ? `A different file already exists at ${path}; this note was kept here.` : (reply.error ?? 'The hub refused the note'))
      return reply.result ?? 'created'
    },
    mark: async (note, handled) => {
      const reply = await postHub                                                ('/api/mark', { note, handled })
      if (!reply.ok || typeof reply.atMs !== 'number') throw sourceError('other', reply.error ?? 'The hub refused the mark')
      return reply.atMs
    },
    summarise: async (path, index, isRedo, hash) => {
      const res = await fetch('/api/summarise', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub': '1' },
        body: JSON.stringify({ path, section: index, redo: isRedo, hash }),
      })
      return (await res.json())                
    },
  }
}

// ---------- GitHub (the phone) ----------

                                                                             

const GITHUB_API = 'https://api.github.com'
const isLocalPage = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1'

// The published app only ever talks to GitHub's API, so the token can't be sent anywhere else. A different API address
// (the test mock) is honoured only when the page itself runs on this machine.
export function effectiveApiBase(settings                )         {
  const wanted = settings.apiBase.trim().replace(/\/+$/, '')
  return isLocalPage() && wanted ? wanted : GITHUB_API
}

// The account the app is published from (<owner>.github.io), which also owns the private profile repo; empty
// anywhere else (the desktop, or testing on this machine).
export function pageOwner()         {
  return location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i)?.[1] ?? ''
}
export const defaultRepo = () => (pageOwner() ? `${pageOwner()}/claude-profile` : '')

// GitHub's new-token page, pre-filled: a name, what it's for, the account, a year's expiry, and the one permission the
// app needs (Contents: read and write; Metadata: read comes with it). GitHub can't pre-select a repository, so
// "Only select repositories → claude-profile" is the one choice left to make there.
export function tokenTemplateUrl(owner        )         {
  const params = new URLSearchParams({
    name: 'Projects hub phone',
    description: 'Projects hub phone app: reads claude-profile and saves notes to memory/phone/. Revoke it if the phone is lost.',
    ...(owner ? { target_name: owner } : {}),
    expires_in: '366',
    contents: 'write',
  })
  return `https://github.com/settings/personal-access-tokens/new?${params}`
}

export function destinationOf(settings                )         {
  return `${new URL(effectiveApiBase(settings)).origin}|${settings.repo.trim().toLowerCase()}`
}

                                                                                 
                 
              
            
              
                
                               
                               
                                 
                                                                                       
                           
                                                                              
                        
                       
               
 

const SNAPSHOT_PREFIX = 'hub.gh.snapshot.'
const snapshotKey = (dest        ) => `${SNAPSHOT_PREFIX}${dest}`

// The last good snapshot for this destination, or null. A snapshot made for another repository is never returned.
function readSnapshot(dest        )                  {
  try {
    const s = JSON.parse(localStorage.getItem(snapshotKey(dest)) ?? 'null')                   
    return s && s.dest === dest ? s : null
  } catch {
    return null
  }
}

// Set when the phone couldn't keep its offline copy (storage full); the page says so.
let snapshotProblem = ''
export const snapshotSaveProblem = () => snapshotProblem

// The reset marker this device had when a source was made. "Remove all hub data" sets a new one, and a source made
// before it stops writing: no offline copy saved and no note sent after the reset, even from a request already running.
export const EPOCH_KEY = 'hub.epoch'
const currentEpoch = () => localStorage.getItem(EPOCH_KEY) ?? ''

export function githubSource(settings                , signal              )         {
  const [owner, name] = settings.repo.trim().split('/')
  const api = effectiveApiBase(settings)
  const dest = destinationOf(settings)
  const epoch = currentEpoch()
  const isRetired = () => signal?.aborted === true || currentEpoch() !== epoch
  const headers = {
    authorization: `Bearer ${settings.token.trim()}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  // The last good snapshot, kept on the phone so projects and records still read offline.
  let snapshot                  = readSnapshot(dest)

  async function graphql   (query        )             {
    let res          
    try {
      res = await fetch(`${api}/graphql`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables: { owner, name } }),
        signal,
      })
    } catch {
      throw isRetired() ? sourceError('other', 'Stopped') : sourceError('offline', 'No connection to GitHub')
    }
    if (isRateLimited(res)) throw sourceError('other', 'GitHub is limiting requests for now. Try again in a few minutes.')
    if (res.status === 401 || res.status === 403) {
      throw sourceError('auth', `GitHub refused the token (${res.status}). It may have expired or been revoked: make a new one in Settings.`)
    }
    if (!res.ok) throw sourceError('other', `GitHub answered ${res.status}`)
    const reply = (await res.json())                                                                       
    if (reply.errors?.length) throw sourceError('other', reply.errors.map(e => e.message).join('; '))
    if (!reply.data?.repository) throw sourceError('auth', `Can't see ${settings.repo}: check the repo name and the token's access.`)
    return reply.data.repository
  }

  const blob = (path        ) => `object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text } }`
  const tree = (path        ) =>
    `object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Tree { entries { name type object { ... on Blob { text } } } } }`
  const wrap = (fields        ) => `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`
  const contentsUrl = (path        ) => `${api}/repos/${owner}/${name}/contents/${path.split('/').map(encodeURIComponent).join('/')}`

  // Two requests: every file the views need, then the newest commit for each record.
  async function load()                    {
    const dirs                         = {
      pd: 'memory/desktop/projects',
      pl: 'memory/laptop/projects',
      notes: `${PHONE_DIR}/notes`,
      ideas: `${PHONE_DIR}/ideas`,
      dnotes: `${DESKTOP_NOTES_DIR}/notes`,
      dideas: `${DESKTOP_NOTES_DIR}/ideas`,
      pmarks: MARK_DIRS[0],
      dmarks: MARK_DIRS[1],
    }
    const first = await graphql                                                                 (
      wrap([
        `sync: ${blob('sync.sh')}`,
        `profile: ${blob('profile.md')}`,
        ...MACHINES.map(m => `usage_${m}: ${blob(`memory/${m}/hub/usage.md`)}`),
        ...Object.entries(dirs).map(([alias, dir]) => `${alias}: ${tree(dir)}`),
      ].join('\n')),
    )
    const texts                         = {}
    for (const [alias, dir] of Object.entries(dirs)) {
      for (const entry of first[alias]?.entries ?? []) {
        if (entry.type === 'blob' && entry.name.endsWith('.md') && typeof entry.object?.text === 'string') {
          texts[`${dir}/${entry.name}`] = entry.object.text
        }
      }
    }
    const hosts = parseHosts(first.sync?.text ?? '')
    // The owner's name, so the home can find what waits on them (kept out of the published app).
    const owner = ownerOf(first.profile?.text ?? '')
    const usage = MACHINES.flatMap(m => parseUsageSnapshot(first[`usage_${m}`]?.text ?? '')?.readings ?? [])

    const records = Object.keys(texts).filter(p => /^memory\/(?:desktop|laptop)\/projects\//.test(p))
    const edits                         = {}
    const days                           = {}
    const daysIncomplete           = []
    let published                       
    if (records.length > 0) {
      // For each record, its newest commit (when and by which machine) and its commits over the chart's 14 days.
      const since = JSON.stringify(new Date(Date.now() - (CHART_DAYS + 1) * DAY_MS).toISOString())
      const history = await graphql  
                           
                                                                                                                                       
                
        (
        wrap(
          `defaultBranchRef { target { ... on Commit { recent: history(first: 100) { nodes { committedDate messageHeadline } }\n${records
            .map(
              (p, i) =>
                `e${i}: history(first: 1, path: ${JSON.stringify(p)}) { nodes { committedDate messageHeadline } }\n` +
                `d${i}: history(first: 100, since: ${since}, path: ${JSON.stringify(p)}) { pageInfo { hasNextPage } nodes { committedDate } }`,
            )
            .join('\n')} } } }`,
        ),
      )
      published = publishedBy(
        (history.defaultBranchRef?.target.recent?.nodes ?? []).map(n => ({ atMs: Date.parse(n.committedDate), by: commitBy(n.messageHeadline ?? '', hosts) })),
      )
      records.forEach((p, i) => {
        const target = history.defaultBranchRef?.target
        const node = target?.[`e${i}`]?.nodes[0]
        if (node) edits[p] = { atMs: Date.parse(node.committedDate), by: commitBy(node.messageHeadline ?? '', hosts) }
        days[p] = [...new Set((target?.[`d${i}`]?.nodes ?? []).map(n => dayKeyOf(Date.parse(n.committedDate))))]
        // More than a page of commits in the window: the chart says this record's history is incomplete here, rather
        // than silently dropping its earlier days.
        if (target?.[`d${i}`]?.pageInfo?.hasNextPage) daysIncomplete.push(p)
      })
    }

    const isIn = (p        , kinds          ) => kinds.some(k => p.startsWith(`${k}/`))
    const noteDirs = NOTE_DIRS.flatMap(d => [`${d}/notes`, `${d}/ideas`])
    const notes = withHandled(
      Object.entries(texts)
        .filter(([p]) => isIn(p, noteDirs))
        .map(([p, text]) => parseNote(p, text)),
      Object.entries(texts)
        .filter(([p]) => isIn(p, MARK_DIRS))
        .map(([p, text]) => parseHandledMark(p, text)),
    )

    if (isRetired()) throw sourceError('other', 'Stopped')
    snapshot = { dest, at: Date.now(), hosts, owner, texts, edits, days, daysIncomplete, usage, published, notes }
    try {
      localStorage.setItem(snapshotKey(dest), JSON.stringify(snapshot))
      snapshotProblem = ''
    } catch {
      snapshotProblem = "Couldn't keep an offline copy: this phone's storage for the app is full."
    }
    return snapshot
  }

  async function current()                    {
    return snapshot ?? (await load())
  }

  return {
    kind: 'github',
    dest,
    // A fresh load each time; offline, the caller falls back to snapshotProjects().
    projects: async () => {
      const s = await load()
      return { now: Date.now(), projects: projectsFrom(s), live: [], usage: s.usage, published: s.published }
    },
    record: async path => {
      const s = await current()
      let text = s.texts[path]
      if (text === undefined) {
        const one = await graphql                                 (wrap(`f: ${blob(path)}`))
        if (typeof one.f?.text !== 'string') throw sourceError('other', `${path} isn't in the repo`)
        text = one.f.text
      }
      let history           = []
      try {
        const h = await graphql                                                                                                                 (
          wrap(`defaultBranchRef { target { ... on Commit { h: history(first: 6, path: ${JSON.stringify(path)}) { nodes { committedDate messageHeadline } } } } }`),
        )
        history = (h.defaultBranchRef?.target.h.nodes ?? []).map(n => ({ atMs: Date.parse(n.committedDate), by: commitBy(n.messageHeadline, s.hosts) }))
      } catch {
        // Offline: the record still reads from the snapshot, without its history.
      }
      return { ...parseDoc(path, text), history }
    },
    notes: async () => (await current()).notes,
    notesDir: PHONE_DIR,
    search: async query => searchRecords((await current()).texts, query),
    // A mark is a new small file in memory/phone/handled/, created like a note.
    mark: async (note, handled) => {
      const atMs = Date.now()
      const file = formatHandledMark(note, handled, atMs, noteId(), PHONE_DIR)
      await createFile(file.path, file.text, `Phone: ${handled ? 'handled' : 'reopened'} ${note.split('/').pop()}`)
      return atMs
    },
    createFile: async (path, text, message) => createFile(path, text, message),
  }

  // Creates a new file through the contents API (create-only: an existing path is never overwritten).
  async function createFile(path        , text        , message        )                                {
    if (isRetired()) throw sourceError('other', 'Stopped: the app was reset or its settings changed')
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    let res          
    try {
      res = await fetch(contentsUrl(path), {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ message, content: btoa(binary) }),
        signal,
      })
    } catch {
      throw isRetired() ? sourceError('other', 'Stopped') : sourceError('offline', 'No connection to GitHub')
    }
    if (res.status === 201 || res.status === 200) return 'created'
    if (isRateLimited(res)) throw sourceError('offline', 'GitHub is limiting requests for now; the note is kept and will send later.')
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw sourceError('auth', `GitHub refused the note (${res.status}). The token needs Contents: read and write on ${settings.repo}.`)
    }
    if (res.status === 422) {
      const detail = ((await res.json().catch(() => ({})))                        ).message ?? ''
      if (!/\bsha\b/i.test(detail)) throw sourceError('other', `GitHub refused the note: ${detail || 'invalid request'}`)
      // Something is already at this path. It counts as delivered only if it's exactly this note (a retry that
      // arrived); anything else is a conflict to show, never a silent success.
      let existing                = null
      try {
        const got = await fetch(contentsUrl(path), { headers: { ...headers, accept: 'application/vnd.github.raw+json' }, signal })
        if (got.ok) existing = await got.text()
      } catch {
        throw sourceError('offline', 'No connection to GitHub')
      }
      const same = (a        ) => a.replace(/\r\n/g, '\n').trimEnd()
      if (existing !== null && same(existing) === same(text)) return 'exists'
      throw sourceError('conflict', `A different file already exists at ${path}; this note was kept on the phone.`)
    }
    throw sourceError('other', `GitHub answered ${res.status}`)
  }
}

function projectsFrom(s          )            {
  const list            = []
  for (const machine of MACHINES             ) {
    const index = s.texts[`memory/${machine}/projects/INDEX.md`]
    if (index === undefined) continue
    for (const row of parseIndexRows(index)) {
      const file = row.fileName ? `memory/${machine}/projects/${row.fileName}` : ''
      list.push(buildProject(machine, row, s.texts[file] ?? '', s.edits[file], Date.now(), list.length, {
          owner: s.owner ?? '',
          updatedDays: s.days?.[file] ?? [],
          activityComplete: !(s.daysIncomplete ?? []).includes(file),
        }))
    }
  }
  return pairProjects(list)
}

// The age of the saved copy for these settings, for the "offline, showing data from …" line.
export function snapshotAge(settings                )                {
  return readSnapshot(destinationOf(settings))?.at ?? null
}

// Offline start: rebuild the views from the saved copy for these settings, without a request.
export function snapshotProjects(settings                )              {
  if (!settings.repo.trim()) return null
  const s = readSnapshot(destinationOf(settings))
  return s ? { now: Date.now(), projects: projectsFrom(s), live: [], usage: s.usage, published: s.published } : null
}

// Everything this app keeps for any repository on this device (snapshots); used by "Remove all hub data".
export function snapshotKeys()           {
  const keys           = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(SNAPSHOT_PREFIX)) keys.push(key)
  }
  return keys
}
