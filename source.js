// Where the hub's data comes from. On the desktop, the local hub server (live Codeg work, summaries, notes as of the
// last sync). On the phone, GitHub: the private claude-profile repo read through the GraphQL API with the owner's own
// fine-grained token, and notes written through the contents API. Both give the views the same shapes.
import { buildProject, commitBy, headerOf, MACHINES, pairProjects, parseDoc, parseHosts, parseIndexRows, parseNote, PHONE_DIR } from './core.js'
                                                                                          

                    
             
                     
              
                                                                            
                                                         
 
                                                                                               
                                                                            
                                                                             

                      
                          
                                                                                                                          
              
                               
                                               
                              
                                                                                     
                                                                                                                 
                                                                                                        
                                                                                             
 

// An error the views can explain: 'auth' (token refused), 'offline' (no connection), 'conflict' (a different file is
// already at a note's path), 'other'.
                                                                       
export function sourceError(code                 , message        )        {
  const error = new Error(message)
  error.name = code
  return error
}

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

export function localSource()         {
  return {
    kind: 'local',
    dest: 'local',
    projects: () => getJson      ('/api/projects'),
    record: path => getJson            (`/api/record?path=${encodeURIComponent(path)}`),
    notes: async () => (await getJson                   ('/api/notes')).notes,
    summarise: async (path, index, isRedo) => {
      const res = await fetch('/api/summarise', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub': '1' },
        body: JSON.stringify({ path, section: index, redo: isRedo }),
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

export function githubSource(settings                )         {
  const [owner, name] = settings.repo.trim().split('/')
  const api = effectiveApiBase(settings)
  const dest = destinationOf(settings)
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
      })
    } catch {
      throw sourceError('offline', 'No connection to GitHub')
    }
    if (res.status === 401 || res.status === 403) throw sourceError('auth', `GitHub refused the token (${res.status}). Check it in Settings.`)
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
    }
    const first = await graphql                                                                 (
      wrap([`sync: ${blob('sync.sh')}`, ...Object.entries(dirs).map(([alias, dir]) => `${alias}: ${tree(dir)}`)].join('\n')),
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

    const records = Object.keys(texts).filter(p => !p.startsWith(`${PHONE_DIR}/`))
    const edits                         = {}
    if (records.length > 0) {
      const history = await graphql  
                                                                                                                            
        (
        wrap(
          `defaultBranchRef { target { ... on Commit { ${records
            .map((p, i) => `e${i}: history(first: 1, path: ${JSON.stringify(p)}) { nodes { committedDate messageHeadline } }`)
            .join('\n')} } } }`,
        ),
      )
      records.forEach((p, i) => {
        const node = history.defaultBranchRef?.target[`e${i}`]?.nodes[0]
        if (node) edits[p] = { atMs: Date.parse(node.committedDate), by: commitBy(node.messageHeadline, hosts) }
      })
    }

    const notes = Object.entries(texts)
      .filter(([p]) => p.startsWith(`${PHONE_DIR}/`))
      .map(([p, text]) => parseNote(p, text))
      .sort((a, b) => (a.path.split('/').pop()  < b.path.split('/').pop()  ? 1 : -1))

    snapshot = { dest, at: Date.now(), hosts, texts, edits, notes }
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
    projects: async () => ({ now: Date.now(), projects: projectsFrom(await load()), live: [] }),
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
    createFile: async (path, text, message) => {
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      for (const b of bytes) binary += String.fromCharCode(b)
      let res          
      try {
        res = await fetch(contentsUrl(path), {
          method: 'PUT',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ message, content: btoa(binary) }),
        })
      } catch {
        throw sourceError('offline', 'No connection to GitHub')
      }
      if (res.status === 201 || res.status === 200) return 'created'
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
          const got = await fetch(contentsUrl(path), { headers: { ...headers, accept: 'application/vnd.github.raw+json' } })
          if (got.ok) existing = await got.text()
        } catch {
          throw sourceError('offline', 'No connection to GitHub')
        }
        const same = (a        ) => a.replace(/\r\n/g, '\n').trimEnd()
        if (existing !== null && same(existing) === same(text)) return 'exists'
        throw sourceError('conflict', `A different file already exists at ${path}; this note was kept on the phone.`)
      }
      throw sourceError('other', `GitHub answered ${res.status}`)
    },
  }
}

function projectsFrom(s          )            {
  const list            = []
  for (const machine of MACHINES             ) {
    const index = s.texts[`memory/${machine}/projects/INDEX.md`]
    if (index === undefined) continue
    for (const row of parseIndexRows(index)) {
      const file = row.fileName ? `memory/${machine}/projects/${row.fileName}` : ''
      list.push(buildProject(machine, row, headerOf(s.texts[file] ?? ''), s.edits[file], Date.now(), list.length))
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
  return s ? { now: Date.now(), projects: projectsFrom(s), live: [] } : null
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
