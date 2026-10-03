// Where the hub's data comes from. On the desktop, the local hub server (live Codeg work, summaries, notes as of the
// last sync). On the phone, GitHub: the private claude-profile repo read through the GraphQL API with the owner's own
// fine-grained token, and notes written through the contents API. Both give the views the same shapes.
import { buildProject, commitBy, headerOf, MACHINES, pairProjects, parseDoc, parseHosts, parseIndexRows, parseNote, PHONE_DIR } from './core.js'
                                                                                          

                    
             
                     
              
                                                                            
                                                         
 
                                                                                               
                                                                            
                                                                             

                      
                          
                               
                                               
                              
                                                                                     
                                                                                           
                                                                                             
 

// An error the views can explain: 'auth' (token refused), 'offline' (no connection), 'other'.
                                                          
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

                                                                             

                                                                                 
                                                                                                                         

const SNAPSHOT_KEY = 'hub.gh.snapshot'

export function githubSource(settings                )         {
  const [owner, name] = settings.repo.trim().split('/')
  const api = settings.apiBase.trim().replace(/\/+$/, '') || 'https://api.github.com'
  const headers = {
    authorization: `Bearer ${settings.token.trim()}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  // The last good snapshot, kept on the phone so projects and records still read offline.
  let snapshot                  = null
  try {
    snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null')                   
  } catch {
    snapshot = null
  }

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

    snapshot = { at: Date.now(), hosts, texts, edits, notes }
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
    } catch {
      // Storage full: the snapshot still works for this session.
    }
    return snapshot
  }

  async function current()                    {
    return snapshot ?? (await load())
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

  return {
    kind: 'github',
    // A fresh load each time; offline, the last snapshot (the caller is told by the error it catches first).
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
        res = await fetch(`${api}/repos/${owner}/${name}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'PUT',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ message, content: btoa(binary) }),
        })
      } catch {
        throw sourceError('offline', 'No connection to GitHub')
      }
      if (res.status === 201 || res.status === 200) return 'created'
      if (res.status === 422) {
        // "sha wasn't supplied" means the file is already there: a retry of a note that did arrive.
        const detail = ((await res.json().catch(() => ({})))                        ).message ?? ''
        if (/\bsha\b/i.test(detail)) return 'exists'
        throw sourceError('other', `GitHub refused the note: ${detail || 'invalid request'}`)
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw sourceError('auth', `GitHub refused the note (${res.status}). The token needs Contents: read and write on ${settings.repo}.`)
      }
      throw sourceError('other', `GitHub answered ${res.status}`)
    },
  }
}

// The last snapshot's age, for the "offline, showing data from …" line.
export function snapshotAge()                {
  try {
    const s = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null')                   
    return s ? s.at : null
  } catch {
    return null
  }
}

export function snapshotProjects(settings                )              {
  // Offline start: rebuild the views from the stored snapshot without a request.
  const s = (() => {
    try {
      return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null')                   
    } catch {
      return null
    }
  })()
  if (!s || !settings.repo) return null
  const list            = []
  for (const machine of MACHINES             ) {
    const index = s.texts[`memory/${machine}/projects/INDEX.md`]
    if (index === undefined) continue
    for (const row of parseIndexRows(index)) {
      const file = row.fileName ? `memory/${machine}/projects/${row.fileName}` : ''
      list.push(buildProject(machine, row, headerOf(s.texts[file] ?? ''), s.edits[file], Date.now(), list.length))
    }
  }
  return { now: Date.now(), projects: pairProjects(list), live: [] }
}
