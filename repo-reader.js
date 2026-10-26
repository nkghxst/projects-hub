// Independent browser-local repository reader. Never imports profile writer settings.
                                                                                                                     
                                                       
                                                                                                                                                   
                                                                                                    

export const REPO_READER_PREFIX = 'hub.repoReader.'
const TOKEN = `${REPO_READER_PREFIX}token`, EPOCH = `${REPO_READER_PREFIX}epoch`, COPIES = `${REPO_READER_PREFIX}copies`
const MAX_FILE = 256 * 1024, MAX_JSON = 2 * 1024 * 1024, MAX_COPIES = 20
const encoder = new TextEncoder(), sha = (s        )              => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s)
const object = (v        )                               => v !== null && typeof v === 'object' && !Array.isArray(v)
const objectKeys = (v                        , keys         ) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key))
const clean = (v        , max       )              => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(v) && v.trim() === v
const same = (a        , b        ) => JSON.stringify(a) === JSON.stringify(b)
const sameScope = (a          , b          ) => a.dest === b.dest && a.project === b.project
let generation = 0
const active = new Set                 ()
const inFlight = new Map                         ()

function validScope(v        )                 { return object(v) && clean(v.dest, 2048) && clean(v.project, 2048) }
function validRef(v        )              {
  return v === '' || (clean(v, 255) && !/[\s\\~^:?*\[\]]/.test(v) && v !== '@' && !v.includes('@{') && !v.includes('..') && !v.startsWith('-') && v.split('/').every(p => p !== '' && p !== '.' && !p.startsWith('.') && !p.endsWith('.') && !p.endsWith('.lock')))
}
function validDocument(v        )                    {
  return object(v) && clean(v.id, 100) && clean(v.label, 160) && (v.kind === 'roadmap' || v.kind === 'readme') &&
    typeof v.repo === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(v.repo) && !['.', '..'].includes(v.repo.split('/')[1]) &&
    validRef(v.ref) && clean(v.path, 1024) && !/[\\:]/.test(v.path) && /\.(md|markdown)$/i.test(v.path) &&
    v.path.split('/').length <= 16 && v.path.split('/').every(p => p !== '' && p !== '.' && p !== '..')
}
function documentValue(v             )               { return { id:v.id, label:v.label, kind:v.kind, repo:v.repo, ref:v.ref, path:v.path } }
function documentsKey(scope          )         { return `${REPO_READER_PREFIX}documents.${JSON.stringify([scope.dest, scope.project])}` }
function parse(raw            )          { try { return JSON.parse(raw ?? 'null') } catch { return null } }
function get(key       )              { try { return localStorage.getItem(key) } catch { return null } }
function tokenValue()         { const value = get(TOKEN); return value && validToken(value) ? value : '' }
function validToken(value        )                  { return typeof value === 'string' && /^[\x21-\x7e]{1,512}$/.test(value) }
function storageError()        { return new Error('Browser storage is unavailable or full; changes were not saved.') }
function write(key       , value       )       { try { localStorage.setItem(key, value) } catch { throw storageError() } }
function remove(key       )       { try { localStorage.removeItem(key) } catch { throw storageError() } }

function parseDocuments(raw            )                 {
  const docs = parse(raw)
  return Array.isArray(docs) && docs.length <= 8 && docs.every(validDocument) && new Set(docs.map(d => d.id)).size === docs.length ? docs.map(documentValue) : []
}
export function readRepoDocuments(scope          )                 {
  return validScope(scope) ? parseDocuments(get(documentsKey(scope))) : []
}
export function retireRepoReads()       { generation++; for (const controller of active) controller.abort(); active.clear(); inFlight.clear() }
function changeEpoch()       { retireRepoReads(); write(EPOCH, `${Date.now()}-${crypto.randomUUID()}`) }
export function hasRepoToken()          { return Boolean(tokenValue()) }
export function saveRepoToken(token       )       {
  if (!validToken(token)) throw new Error('Enter a non-empty repository token without spaces or control characters.')
  changeEpoch(); write(TOKEN, token)
}
export function forgetRepoToken()       { changeEpoch(); remove(TOKEN) }
export function clearRepoCopies()       { changeEpoch(); remove(COPIES) }
export function saveRepoDocuments(scope          , docs               )       {
  if (!validScope(scope) || !Array.isArray(docs) || docs.length > 8 || !docs.every(validDocument) || new Set(docs.map(d => d.id)).size !== docs.length) throw new Error('Invalid repository documents: use up to eight unique documents, owner/repository, a Git ref and a Markdown path of at most 16 components.')
  // Epoch goes first, including when a later quota failure leaves the previous mapping intact.
  changeEpoch(); write(documentsKey(scope), JSON.stringify(docs.map(documentValue)))
  // A single envelope replacement preserves existing bytes if quota rejects the cleanup.
  const copies = readCopies()
  if (get(COPIES) !== null) {
    try { write(COPIES, JSON.stringify({ version:1, copies })) }
    catch { throw new Error('Repository mappings were saved, but saved-document cleanup failed: browser storage is unavailable or full.') }
  }
}
function mapped(scope          , doc             )          { return validScope(scope) && validDocument(doc) && readRepoDocuments(scope).some(d => same(d, documentValue(doc))) }
function validDate(value        )                  {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction                 ) => `.${(fraction ?? '').padEnd(3, '0')}Z`)
}
function validCopy(value        )                    {
  if (!object(value) || value.version !== 1 || !validScope(value.scope) || !validDocument(value.document) || typeof value.text !== 'string' || !sha(value.revision) || (value.updatedAt !== null && !validDate(value.updatedAt)) || typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt) || value.fetchedAt < 0) return false
  if (!objectKeys(value, ['version', 'scope', 'document', 'text', 'revision', 'updatedAt', 'fetchedAt']) || !objectKeys(value.scope, ['dest', 'project']) || !objectKeys(value.document, ['id', 'label', 'kind', 'repo', 'ref', 'path'])) return false
  const bytes = encoder.encode(value.text)
  return bytes.length <= MAX_FILE && new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(bytes) === value.text && mapped(value.scope, value.document)
}
function readCopies()             {
  const raw = get(COPIES)
  if (!raw || encoder.encode(raw).length > MAX_JSON) return []
  const envelope = parse(raw)
  if (!object(envelope) || !objectKeys(envelope, ['version', 'copies']) || envelope.version !== 1 || !Array.isArray(envelope.copies) || envelope.copies.length > MAX_COPIES) return []
  const copies = envelope.copies.filter(validCopy), identities = copies.map(c => JSON.stringify([c.scope.dest, c.scope.project, documentValue(c.document)]))
  return new Set(identities).size === identities.length ? copies : []
}
export function readRepoCopy(scope          , doc             )                {
  if (!mapped(scope, doc)) return null
  return readCopies().find(c => sameScope(c.scope, scope) && same(c.document, documentValue(doc))) ?? null
}
function cacheCopy(copy         , check         )       {
  const copies = readCopies().filter(c => !(sameScope(c.scope, copy.scope) && same(c.document, copy.document)))
  copies.push(copy); copies.sort((a,b) => a.fetchedAt - b.fetchedAt)
  let serialized = JSON.stringify({ version:1, copies })
  while (copies.length > MAX_COPIES || encoder.encode(serialized).length > MAX_JSON) {
    copies.shift(); serialized = JSON.stringify({ version:1, copies })
  }
  check(); write(COPIES, serialized)
}

class ReadError extends Error {}
const invalid = () => new ReadError('Invalid or oversized repository data.')
function apiError(status       , limited        )            {
  if (status === 429 || limited) return new ReadError('Repository API rate limit reached; try again later.')
  if (status === 401 || status === 403) return new ReadError('Repository authentication or access failed; check the separate read connection and selected repositories.')
  if (status === 404) return new ReadError('Repository, ref or file not found, or unavailable to this connection.')
  return new ReadError('Repository API request failed; try again later.')
}
// Race even injected fetch/body implementations which ignore AbortSignal, cleaning each listener.
async function abortable   (work           , signal            )             {
  if (signal.aborted) throw new ReadError('Stopped: repository read was retired.')
  let abort          = () => {}
  const cancelled = new Promise       ((_, reject) => { abort = () => reject(new ReadError('Stopped: repository read was retired.')); signal.addEventListener('abort', abort, { once:true }) })
  try { return await Promise.race([work, cancelled]) } finally { signal.removeEventListener('abort', abort) }
}
async function request(path       , token       , signal            , check         , shaMedia = false)                   {
  check()
  const url = `https://api.github.com${path}`
  if (!path.startsWith('/repos/') || new URL(url).origin !== 'https://api.github.com') throw invalid()
  const response = await abortable(fetch(url, { method:'GET', headers:{ Authorization:`Bearer ${token}`, Accept:shaMedia?'application/vnd.github.sha':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' }, redirect:'error', credentials:'omit', cache:'no-store', signal }), signal)
  check()
  if (response.redirected || (response.url && new URL(response.url).origin !== 'https://api.github.com') || (response.status >= 300 && response.status < 400)) throw new ReadError('Repository redirect refused.')
  if (!response.ok) throw apiError(response.status, response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
  const length = response.headers.get('content-length')
  const maxBody = shaMedia ? 40 : MAX_JSON
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBody)) throw invalid()
  if (!response.body) throw invalid()
  const stream = response.body.getReader(), chunks              = []
  let total = 0
  try {
    for (;;) {
      const chunk = await abortable(stream.read(), signal); check()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBody) throw invalid()
      chunks.push(chunk.value)
    }
  } finally { void stream.cancel().catch(() => {}); stream.releaseLock() }
  const bytes = new Uint8Array(total); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const text = new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(bytes)
    if (shaMedia) { if (!sha(text)) throw invalid(); return text }
    return JSON.parse(text)
  } catch { throw invalid() }
}
function decodeFile(payload        , doc             , blob       )         {
  if (!object(payload) || payload.type !== 'file' || payload.path !== doc.path || payload.sha !== blob || payload.encoding !== 'base64' || 'target' in payload || 'submodule_git_url' in payload || typeof payload.size !== 'number' || !Number.isInteger(payload.size) || payload.size < 0 || payload.size > MAX_FILE || typeof payload.content !== 'string') throw invalid()
  const content = payload.content.replace(/[\r\n]/g, '')
  if (content.length > Math.ceil(MAX_FILE / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw invalid()
  try {
    const binary = atob(content)
    if (btoa(binary) !== content || binary.length !== payload.size) throw invalid()
    return new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
  } catch { throw invalid() }
}

export async function refreshRepoDocument(scope          , doc             )                          {
  let saved               = null
  const failed = (error       , copy               = saved)                 => ({ copy, refreshed:false, cached:Boolean(copy), error })
  if (!validScope(scope) || !validDocument(doc)) return failed('Repository document is invalid or its mapping has changed.', null)
  // Capture before deriving authorisation. Every request uses this snapshot's token/mapping,
  // never values read before it; a second capture detects changes during the first capture.
  scope = { dest:scope.dest, project:scope.project }; doc = documentValue(doc)
  const current = generation, mappingKey = documentsKey(scope)
  const snapshot = () => [get(TOKEN), get(EPOCH), get('hub.epoch'), get(mappingKey)]         
  const identity = snapshot()
  const changed = () => current !== generation || !same(identity, snapshot())
  const stopped = () => failed('Stopped: repository connection, documents or source changed.', null)
  if (changed()) return stopped()
  if (!parseDocuments(identity[3]).some(d => same(d, doc))) return failed('Repository document is invalid or its mapping has changed.', null)
  const token = validToken(identity[0]) ? identity[0] : ''
  saved = readRepoCopy(scope, doc)
  if (changed()) return stopped()
  if (!token) return failed('Set up the separate repository read token to refresh. Any saved copy remains available.')
  const controller = new AbortController()
  const requestKey = JSON.stringify([scope.dest, scope.project, documentValue(doc)])
  inFlight.get(requestKey)?.abort(); inFlight.set(requestKey, controller)
  const check = () => { if (changed() || controller.signal.aborted) throw new ReadError('Stopped: repository connection, documents or source changed.') }
  active.add(controller)
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 20000)
  const api = (path       ) => request(path, token, controller.signal, check)
  try {
    const base = `/repos/${doc.repo.split('/').map(encodeURIComponent).join('/')}`
    let ref = doc.ref
    if (!ref) { const repo = await api(base); if (!object(repo) || !validRef(repo.default_branch) || !repo.default_branch) throw invalid(); ref = repo.default_branch }
    const revision = await request(`${base}/commits/${encodeURIComponent(ref)}`, token, controller.signal, check, true)
    if (!sha(revision)) throw invalid()
    const commit = await api(`${base}/git/commits/${revision}`)
    if (!object(commit) || commit.sha !== revision || !object(commit.tree) || !sha(commit.tree.sha)) throw invalid()
    let treeSha = commit.tree.sha, blob = ''
    const parts = doc.path.split('/')
    for (let i = 0; i < parts.length; i++) {
      const tree = await api(`${base}/git/trees/${treeSha}`)
      if (!object(tree) || tree.sha !== treeSha || tree.truncated === true || !Array.isArray(tree.tree)) throw invalid()
      const entries = tree.tree.filter(e => object(e) && e.path === parts[i])
      if (entries.length !== 1 || !object(entries[0]) || !sha(entries[0].sha)) throw invalid()
      const entry = entries[0]
      if (i === parts.length - 1) { if (entry.type !== 'blob' || !['100644', '100755'].includes(String(entry.mode))) throw invalid(); blob = entry.sha           }
      else { if (entry.type !== 'tree' || entry.mode !== '040000') throw invalid(); treeSha = entry.sha           }
    }
    const payload = await api(`${base}/contents/${parts.map(encodeURIComponent).join('/')}?ref=${revision}`)
    const text = decodeFile(payload, doc, blob)
    let updatedAt             = null
    try {
      const history = await api(`${base}/commits?sha=${revision}&path=${encodeURIComponent(doc.path)}&per_page=1`)
      if (Array.isArray(history) && history.length === 1 && object(history[0]) && sha(history[0].sha) && object(history[0].commit) && object(history[0].commit.committer) && validDate(history[0].commit.committer.date)) updatedAt = history[0].commit.committer.date
    } catch { check() /* Missing history is unknown; cancellation retires the entire read. */ }
    check()
    const copy          = { version:1, scope, document:doc, text, revision, updatedAt, fetchedAt:Date.now() }
    try { cacheCopy(copy, check) } catch (error) {
      check()
      return { copy, refreshed:true, cached:false, error:'Document read successfully but was not saved: browser storage is unavailable or full.' }
    }
    return { copy, refreshed:true, cached:true, error:'' }
  } catch (error) {
    if (changed()) return failed('Stopped: repository connection, documents or source changed.', null)
    if (timedOut) return failed('Repository read timed out after 20 seconds.')
    if (controller.signal.aborted) return failed('Stopped: repository read was retired.', null)
    return failed(error instanceof ReadError ? error.message : 'Repository network request failed; check your connection and try again.')
  } finally {
    clearTimeout(timeout); active.delete(controller)
    if (inFlight.get(requestKey) === controller) inFlight.delete(requestKey)
  }
}

export function repoSourceUrl(copy         )         {
  if (!validScope(copy.scope) || !validDocument(copy.document) || !sha(copy.revision)) return ''
  return `https://github.com/${copy.document.repo}/blob/${copy.revision}/${copy.document.path.split('/').map(encodeURIComponent).join('/')}`
}
export function repoLinkResolver(copy         )                                                      {
  const source = repoSourceUrl(copy)
  return href => {
    if (!source || !clean(href, 4096) || href.includes('\\') || href.startsWith('//')) return null
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      try { const url = new URL(href); return url.protocol === 'https:' && !url.username && !url.password ? { href:url.href, isInternal:false } : null } catch { return null }
    }
    const tailAt = href.search(/[?#]/), path = tailAt < 0 ? href : href.slice(0, tailAt), tail = tailAt < 0 ? '' : href.slice(tailAt)
    if (!path) return { href:source + tail, isInternal:false }
    const parts = path.startsWith('/') ? [] : copy.document.path.split('/').slice(0, -1)
    try {
      for (const raw of path.split('/')) {
        const part = decodeURIComponent(raw)
        if (/[\\/\u0000-\u001f\u007f:]/.test(part) || /%2e|%2f|%5c/i.test(part)) return null
        if (!part || part === '.') continue
        if (part === '..') { if (!parts.length) return null; parts.pop() } else parts.push(part)
      }
      return { href:`https://github.com/${copy.document.repo}/blob/${copy.revision}/${parts.map(encodeURIComponent).join('/')}${tail}`, isInternal:false }
    } catch { return null }
  }
}

// Integration also retires on source/close; this catches other tabs when events are delivered.
globalThis.addEventListener?.('storage', event => {
  const key = (event                ).key
  if (key === null || key === 'hub.epoch' || key.startsWith(REPO_READER_PREFIX)) retireRepoReads()
})
