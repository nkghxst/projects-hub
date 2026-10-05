// What the hub does: load data, send queued notes, summarise, save drafts and settings, filter, and follow routes.
// Each action changes state and calls changed() for a redraw.
import { ASK_MAX_SOURCES, currentSectionIndex, fmtStamp, notesBehind, pickUpPrompt, recordChanges, sectionHash, seenVersion, shareBriefOf, formatNote, isWebUrl, looksLikeSecret, PHONE_DIR, printsOf, sharePrompt } from './core.js'
                                                                                                  
import { captureHref, currentRoute, recordHref } from './routes.js'
import { diffPrints, initSeen, markSeen, seenPrints } from './seen.js'
import { githubSource, snapshotAge, snapshotKeys, snapshotProjects } from './source.js'
                                         
import {
  changed,
  deviceName,
  dropQueued,
  EMPTY_DRAFT,
  errorText,
  isConfigured,
  isQueued,
  openNotes,
  newQueueId,
  putQueued,
  QUEUE_PREFIX,
  readQueue,
  refreshQueue,
  settings,
  state,
  toast,
  UNKNOWN_DEST,
} from './state.js'
                                                           

export async function loadAll() {
  const source = state.source
  if (!source) return
  const generation = state.sourceGeneration
  try {
    const data = await source.projects()
    if (generation !== state.sourceGeneration) return
    state.data = data
    // New data may change what a search finds: run the active one again.
    if (state.filters.query.trim().length >= 2 && state.searchFor) scheduleSearch()
    initSeen(data.projects)
    noteRecordSeen()
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
    if (generation === state.sourceGeneration) state.notes = withLocalMarks(notes)
  } catch {
    // Keep the notes already shown.
  }
}

// Each load gets a number and remembers which source it was asked of; a reply that arrives after a newer load
// started, or after Settings or a reset replaced the source, is dropped. So a slow record can't replace the one opened
// after it, and an old repository's record can't appear under a new one. Reloading the record already shown, from
// the same source (a refresh), keeps its open sections; a failed refresh keeps it on screen only in that case.
let recordRequest = 0
export async function loadRecord(path        ) {
  const request = ++recordRequest
  const generation = state.sourceGeneration
  const dest = state.source?.dest ?? ''
  const isSameRecord = state.record?.path === path && state.recordDest === dest
  try {
    if (!state.source) throw new Error('not connected')
    const record = await state.source.record(path)
    if (request !== recordRequest || generation !== state.sourceGeneration) return
    state.record = record
    state.recordDest = dest
    state.recordError = ''
    noteRecordSeen()
    if (!isSameRecord) void loadMentions(path)
    if (isSameRecord) {
      state.open = new Set([...state.open].filter(k => Number(k) < record.sections.length))
    } else {
      // A record with a dated current checkpoint opens on its brief, sections closed; one without opens its first.
      const hasCurrent = record.sections.some(x => /^(?:current|latest)\b/i.test(x.title))
      state.open = new Set(!hasCurrent && record.sections.length > 0 ? ['0'] : [])
      state.liveMore = false
      state.pending = new Set()
    }
  } catch (error) {
    if (request !== recordRequest || generation !== state.sourceGeneration) return
    // A failed refresh of the same record from the same source keeps it on screen; anything else says why.
    if (!isSameRecord) {
      state.record = null
      state.recordDest = ''
      state.recordError = `Couldn't open ${path}: ${errorText(error)}`
    }
  }
}

// Replaces the active source: stops its requests, invalidates work started for it, and clears what it showed.
function replaceSource(next               ) {
  clearLocalMarks()
  clearSearch()
  state.abort.abort()
  state.abort = new AbortController()
  state.sourceGeneration++
  state.source = next
  // The assistant and share panel hold private record text: they go with the connection (Codex M5 review).
  state.ask = null
  state.share = null
  state.term = null
  state.changes = {}
  state.data = null
  state.notes = []
  state.record = null
  state.recordDest = ''
  state.isOffline = false
  state.error = ''
}

export const connectGitHub = () => githubSource(settings, state.abort.signal)

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
  // Show the sent notes as sent straight away, then again once the reload brings them back from GitHub.
  refreshQueue()
  changed()
  if (sent > 0 && generation === state.sourceGeneration) {
    // The desktop app saves into this computer's clone (the next profile sync publishes it); the phone sends to GitHub.
    const where = source.kind === 'local' ? "saved to this computer's claude-profile" : 'sent to GitHub'
    toast(sent === 1 ? `${where[0].toUpperCase()}${where.slice(1)}` : `${sent} notes ${where}`)
    await loadAll()
    changed()
  }
}

export function setFilters(change                  ) {
  state.filters = { ...state.filters, ...change }
  const { query: _query, ...kept } = state.filters
  localStorage.setItem('hub.filters', JSON.stringify(kept))
  changed()
  if ('query' in change) scheduleSearch()
}

// Whole-record search for the filter text, a moment after typing stops. Each request has a number and remembers the
// connection it was made through; a reply or error for anything but the latest request, on the current connection,
// is dropped, so an old answer can never replace a newer one or leave the box stuck on "Searching…".
let searchTimer                                           
let searchRequest = 0
export function clearSearch() {
  clearTimeout(searchTimer)
  searchRequest++
  state.searchHits = null
  state.searchFor = ''
}
export function scheduleSearch() {
  clearTimeout(searchTimer)
  const query = state.filters.query.trim()
  if (query.length < 2) {
    state.searchHits = null
    state.searchFor = ''
    return
  }
  searchTimer = setTimeout(() => void runSearch(query), 250)
}
async function runSearch(query        ) {
  const search = state.source?.search
  if (!search) return
  const request = ++searchRequest
  const generation = state.sourceGeneration
  const isCurrent = () => request === searchRequest && generation === state.sourceGeneration && state.filters.query.trim() === query
  let hits              = []
  try {
    hits = await search(query)
  } catch {
    // Shown as no results for this query.
  }
  if (!isCurrent()) return
  state.searchHits = hits
  state.searchFor = query
  changed()
}

// Opening a record counts as looking at it. What counts as seen is the version actually on screen (not the project
// list's, which can be newer or older): the sections that changed since this device's previous look are marked for
// the visit, and that version is remembered. A refresh during the visit that shows a newer version marks everything
// changed since the visit began, and remembers the newer version.
function noteRecordSeen() {
  const r = currentRoute()
  if (r.name !== 'record' || state.record?.path !== r.path) return
  const prints = printsOf(state.record)
  const version = JSON.stringify(prints)
  if (state.seenVisit === r.path && state.seenVersion === version) return
  if (state.seenVisit !== r.path) {
    state.seenVisit = r.path
    state.visitBaseline = seenPrints(r.path)
  }
  const diff = state.visitBaseline ? diffPrints(state.visitBaseline, prints) : { changed: new Set        (), removed: [] }
  state.recordChanged = diff.changed
  state.recordRemoved = diff.removed
  state.seenVersion = version
  markSeen(r.path, prints)
}

export async function route() {
  const r = currentRoute()
  state.share = null
  state.term = null
  state.pickUp = false
  if (r.name !== 'record' || r.path !== state.seenVisit) {
    state.seenVisit = ''
    state.seenVersion = ''
    state.visitBaseline = null
    state.recordChanged = new Set()
    state.recordRemoved = []
  }
  if (r.name === 'record') {
    // A different record shows "Loading…" rather than the previous one while it's fetched.
    if (state.record?.path !== r.path) {
      state.record = null
      state.recordError = ''
    }
    changed()
    await loadRecord(r.path)
    // A search result opens its section (unfolding "Other sections" if it's there) and scrolls to it.
    if (r.section !== undefined && state.record && r.section >= 0 && r.section < state.record.sections.length) {
      state.open.add(String(r.section))
      state.openDetails.add('other-sections')
      changed()
      document.getElementById(`section-${r.section}`)?.closest('section')?.scrollIntoView({ block: 'start' })
    } else {
      window.scrollTo(0, 0)
    }
  } else if (r.name === 'capture' && r.project) {
    state.draft = { ...state.draft, kind: 'note', project: r.project }
  } else if (r.name === 'capture' && !state.draft.body && !state.draft.title && !state.draft.source && !state.draft.project) {
    // New from the bar with nothing started: a quick idea, since a note would first need a project.
    state.draft = { ...state.draft, kind: 'idea' }
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

// A summary belongs to the text it was written from: the request carries the section's hash, and the reply is applied to
// whichever section has that hash when it arrives, even if a refresh has moved it. If the section has gone or changed,
// the summary stays in the cache for that text and nothing on screen is mislabelled.
export async function summarise(index        , isRedo         ) {
  const doc = state.record
  const ask = state.source?.summarise
  const hash = doc?.sections[index]?.hash ?? ''
  if (!doc || !ask || !hash || state.pending.has(hash)) return
  const path = doc.path
  const generation = state.sourceGeneration
  state.pending.add(hash)
  changed()
  try {
    const reply = await ask(path, index, isRedo, hash)
    const target = state.record?.path === path && generation === state.sourceGeneration ? state.record.sections.findIndex(s => s.hash === hash) : -1
    if (reply.ok && reply.summary && target !== -1 && state.record) {
      state.record.sections[target].summary = reply.summary           
      // A summary only shows in full while its section is open, so open it to show the result.
      state.open.add(String(target))
    } else if (reply.ok && state.record?.path === path) {
      toast('That section changed while it was being summarised; refresh to see the current text')
    } else if (!reply.ok) {
      toast(`Couldn't summarise: ${reply.error ?? 'unknown error'}`)
    }
  } catch (error) {
    toast(`Couldn't summarise: ${errorText(error)}`)
  } finally {
    state.pending.delete(hash)
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
  const file = formatNote(d, Date.now(), newQueueId(), source.notesDir ?? PHONE_DIR)
  const title = (d.title.trim() || d.body.trim().split('\n')[0] || d.source.trim()).slice(0, 80)
  const project = d.kind === 'note' ? d.project : ''
  putQueued({ id: file.id, dest: source.dest, path: file.path, text: file.text, kind: d.kind, title, project, body: d.body.trim(), createdAt: Date.now() })
  refreshQueue()
  state.draft = { ...EMPTY_DRAFT, kind: d.kind }
  toast(`Saved on ${deviceName()}`)
  location.hash = project ? recordHref(project) : '#/inbox'
  await flushQueue()
}

// Mark a note handled, or open again. The phone writes a mark file to GitHub; the desktop app through the hub server.
// The note itself never changes. A mark needs a connection: offline, it says so rather than pretending.
// Marks this device saved, for the connection they were saved through. A loaded note older than the mark (a load that
// was already running, or one that hasn't caught up) shows the mark instead; once a load carries a mark at least as
// new, from this device or another (say, a later reopen on the phone), the load wins and the entry goes. Retiring
// the connection clears them all.
                                                                                                 
const localMarks = new Map                   ()
export const clearLocalMarks = () => localMarks.clear()
function withLocalMarks(notes        )         {
  return notes.map(n => {
    const mark = localMarks.get(n.path)
    if (!mark || mark.dest !== state.source?.dest || mark.generation !== state.sourceGeneration) return n
    if ((n.markedAtMs ?? -1) >= mark.atMs) {
      localMarks.delete(n.path)
      return n
    }
    return { ...n, handledAtMs: mark.handled ? mark.atMs : null, handledBy: mark.handled ? mark.by : '', markedAtMs: mark.atMs }
  })
}

export async function setHandled(note        , handled         ) {
  const source = state.source
  if (!source?.mark) return toast("Marking needs a connection to the repository")
  const generation = state.sourceGeneration
  try {
    const atMs = await source.mark(note, handled)
    // A reply for a connection that has since been replaced (another repository, a reset) changes nothing here.
    if (generation !== state.sourceGeneration || state.source !== source) return
    // Show it straight away; loads keep showing it until they carry a mark at least this new.
    localMarks.set(note, { handled, atMs, by: source.kind === 'local' ? 'desktop' : 'phone', dest: source.dest, generation })
    state.notes = withLocalMarks(state.notes)
    toast(handled ? 'Marked handled' : 'Reopened')
    changed()
  } catch (error) {
    toast(`Couldn't save that: ${errorText(error)}`)
  }
}

// ---------- sharing a section or a note to Claude ----------

export function openShare(target                                                               ) {
  // The time stamped into the text is fixed when the panel opens, so what's sent is what's shown (Codex M5 review).
  state.share = { ...target, kind: target.target === 'section' ? 'explain' : 'develop', question: '', atMs: Date.now() }
  changed()
}
export function closeShare() {
  state.share = null
  changed()
}
export function setShareKind(kind           ) {
  if (state.share) state.share.kind = kind
  changed()
}

// The prompt the panel shows and the share sends, built from what's on screen.
export function currentShare()                                                         {
  const share = state.share
  if (!share) return null
  if (share.target === 'section') {
    const doc = state.record
    const section = doc?.sections[share.index ?? -1]
    if (!doc || !section) return null
    const p = state.data?.projects.find(x => x.file === doc.path)
    return sharePrompt(
      {
        kind: share.kind,
        question: share.question,
        project: p?.name ?? doc.title,
        machine: p?.machine,
        section: section.title,
        path: doc.path,
        text: section.body,
        ...(p ? { brief: shareBriefOf(p), repos: p.repos ?? [] } : {}),
      },
      share.atMs,
    )
  }
  const note = state.notes.find(n => n.path === share.note)
  if (!note) return null
  const text = `${note.body}${note.source ? `\n\nLink: ${note.source}` : ''}`
  // A note about a project carries that project's brief and repositories, so the app has something to look into.
  const p = note.project ? state.data?.projects.find(x => x.file === note.project) : undefined
  return sharePrompt(
    {
      kind: share.kind,
      question: share.question,
      project: p?.name ?? '',
      section: note.title,
      path: note.path,
      text,
      captured: note.captured,
      ...(p ? { brief: shareBriefOf(p), repos: p.repos ?? [] } : {}),
    },
    share.atMs,
  )
}

// The device's share sheet when there is one (pick the Claude app there), otherwise a copy. Cancelling the sheet is
// quiet. Only the title and text are handed over, never a web address with the text in it.
export async function shareNow() {
  const prompt = currentShare()
  if (!prompt) return
  const nav = navigator                                                                                      
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: prompt.title, text: prompt.text })
      toast('Shared. Any answer is in the app you chose; nothing is saved here.')
      return
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      // Some browsers refuse sharing here: copy instead.
    }
  }
  // A refused share sheet copies the very text it was offered.
  await copyShare(prompt)
}
export async function copyShare(prompt = currentShare()) {
  if (!prompt) return
  try {
    await navigator.clipboard.writeText(prompt.text)
    toast('Copied: paste it into Claude')
  } catch {
    toast("Couldn't copy here")
  }
}

// ---------- mentioned elsewhere ----------

// Where else the open record comes up, fetched once per opening; a reply for another record or source is dropped.
export async function loadMentions(path        ) {
  const source = state.source
  if (!source?.mentions) return
  const generation = state.sourceGeneration
  state.mentions = { path, status: 'loading', list: [] }
  changed()
  try {
    const list = await source.mentions(path)
    if (generation !== state.sourceGeneration || state.mentions?.path !== path) return
    state.mentions = { path, status: 'done', list }
  } catch {
    if (generation !== state.sourceGeneration || state.mentions?.path !== path) return
    state.mentions = { path, status: 'error', list: [] }
  }
  changed()
}

// ---------- picking a project up again ----------

// The pick-up prompt for the open record: what the hub shows, the sections changed since this device last looked
// (the visit's change marks), open notes about it, and newer local work on the desktop.
export function currentPickUp()                {
  const doc = state.record
  const p = doc ? state.data?.projects.find(x => x.file === doc.path) : undefined
  if (!doc || !p) return null
  const changedTitles = [
    ...(state.recordChanged.has('#top') ? ['the top of the record'] : []),
    ...doc.sections.filter(s => state.recordChanged.has(s.title.trim().toLowerCase())).map(s => s.title.trim()),
  ]
  const behind = notesBehind(p, state.data?.live ?? [])
  const root = state.data?.desktop?.worktreeRoot ?? ''
  return pickUpPrompt({
    name: p.name,
    machine: p.machine,
    file: p.file,
    ...(p.pairFile ? { pairFile: p.pairFile } : {}),
    brief: shareBriefOf(p),
    repos: p.repos ?? [],
    changed: changedTitles,
    notes: openNotes()
      .filter(n => n.project === doc.path)
      .map(n => ({ title: n.title, path: n.path })),
    ...(behind && root ? { live: { logPath: behind.logPath, worktreeRoot: root } } : {}),
  })
}
export function openPickUp() {
  state.pickUp = true
  changed()
}
export function closePickUp() {
  state.pickUp = false
  changed()
}
export async function copyPickUp(text = currentPickUp()) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied: paste it into a session on the machine that owns the project')
  } catch {
    toast("Couldn't copy here")
  }
}
export async function sharePickUp() {
  const text = currentPickUp()
  if (!text) return
  const nav = navigator                                                                                      
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: 'Pick up', text })
      return
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
    }
  }
  await copyPickUp(text)
}

// ---------- catch-up: what changed since this device last looked ----------

// Fetches the record's recent saved versions, finds the one this device last saw, and works out what changed since.
// A second call hides it again.
export async function showChanges(file        ) {
  const open = state.changes[file]
  if (open?.isOpen) {
    open.isOpen = false
    return changed()
  }
  const source = state.source
  const p = state.data?.projects.find(x => x.file === file)
  if (!source?.versions || !p) return
  state.changes[file] = { isOpen: true, status: 'loading' }
  changed()
  const generation = state.sourceGeneration
  try {
    const { current, versions } = await source.versions(file)
    if (generation !== state.sourceGeneration || !state.changes[file]?.isOpen) return
    const { index, isExact } = seenVersion(versions, seenPrints(file) ?? {})
    const base = versions[index]
    state.changes[file] = base
      ? { isOpen: true, status: 'done', base, isExact, result: recordChanges(base.text, current ?? versions[0].text, state.data?.owner ?? '') }
      : { isOpen: true, status: 'done' }
  } catch (error) {
    if (generation !== state.sourceGeneration) return
    state.changes[file] = { isOpen: true, status: 'error', error: `Couldn't fetch the saved versions: ${errorText(error)}` }
  }
  changed()
}

// Counts the record's current version as seen on this device, as opening it does.
export function markChangeSeen(file        ) {
  const p = state.data?.projects.find(x => x.file === file)
  if (p) markSeen(file, p.prints)
  delete state.changes[file]
  changed()
}
export function markAllChangesSeen() {
  for (const p of state.data?.projects ?? []) if (p.file) markSeen(p.file, p.prints)
  state.changes = {}
  changed()
}

// ---------- the assistant (desktop) ----------

const labelOf = (path        ) => state.data?.projects.find(p => p.file === path)?.name ?? path.split('/').pop()?.replace(/\.md$/, '') ?? path

function openAsk(kind         , from        , picks                   ) {
  state.ask = { kind, from, question: '', picks, status: 'idle', answer: null, error: '' }
  location.hash = '#/ask'
  changed()
}

// The search results shown (they follow the machine filter); the first ones that fit are ticked.
export function askFromSearch() {
  const machine = state.filters.machine
  const hits = (state.searchHits ?? []).filter(h => machine === 'all' || h.path.startsWith(`memory/${machine}/`))
  if (hits.length === 0) return
  openAsk(
    'answer',
    `Search results for “${state.searchFor}”`,
    hits.map((h, i) => ({
      pick: { path: h.path, section: h.section, title: h.sectionTitle, ...(h.hash ? { hash: h.hash } : {}) },
      label: `${labelOf(h.path)} — ${h.sectionTitle}`,
      isOn: i < ASK_MAX_SOURCES,
    })),
  )
}

// The open record: the text above its sections and its current section, ticked; the other sections listed after
// them, unticked, to add when a question needs them. Each carries the fingerprint of the text shown, so the server sends
// exactly that section (Codex M5 review).
export async function askFromRecord() {
  const doc = state.record
  if (!doc) return
  const current = currentSectionIndex(doc.sections.map(s => s.title))
  const order = [current, ...doc.sections.map((_, i) => i).filter(i => i !== current)].filter(i => i >= 0 && i < doc.sections.length)
  const hashes = await Promise.all(doc.sections.map(s => sectionHash(s.body)))
  if (state.record !== doc) return
  openAsk('answer', `From ${labelOf(doc.path)}`, [
    ...(doc.preamble.trim() ? [{ pick: { path: doc.path, section: -1, title: '' }, label: 'Top of the record', isOn: true }] : []),
    ...order.map(i => ({
      pick: { path: doc.path, section: i, title: doc.sections[i].title, hash: hashes[i] },
      label: i === current ? `${doc.sections[i].title} (current)` : doc.sections[i].title,
      isOn: i === current,
    })),
  ])
}

// A note or idea, developed into a suggested first experiment (with its project's current section, when it has one).
export function askFromNote(path        ) {
  const note = state.notes.find(n => n.path === path)
  if (!note) return
  const project = note.project ? state.data?.projects.find(p => p.file === note.project) : undefined
  openAsk('experiment', `${note.kind === 'idea' ? 'Idea' : 'Note'}: ${note.title}`, [
    { pick: { path: note.path, section: -1, title: '' }, label: `${note.kind === 'idea' ? 'Idea' : 'Note'}: ${note.title}`, isOn: true },
    ...(project?.currentTitle ? [{ pick: { path: project.file, section: 0, title: project.currentTitle }, label: `${project.name} — ${project.currentTitle}`, isOn: true }] : []),
  ])
}

export function toggleAskPick(index        ) {
  const pick = state.ask?.picks[index]
  if (pick) pick.isOn = !pick.isOn
  changed()
}
// The question and kind can't change under an answer being written (Codex M5 review): the answer is for what was sent.
export function setAskKind(kind         ) {
  if (state.ask && state.ask.status !== 'running') state.ask.kind = kind
  changed()
}

// One answer at a time; one that arrives after the sources changed is dropped.
let askRun = 0
export async function runAsk() {
  const ask = state.ask
  const source = state.source
  if (!ask || !source?.ask || ask.status === 'running') return
  const sources = ask.picks.filter(p => p.isOn).map(p => p.pick)
  ask.error = ask.kind === 'answer' && !ask.question.trim() ? 'Type a question first.' : sources.length === 0 ? 'Tick at least one source.' : ''
  if (ask.error) return changed()
  const run = ++askRun
  const generation = state.sourceGeneration
  ask.status = 'running'
  ask.answer = null
  changed()
  let result           
  try {
    result = await source.ask({ kind: ask.kind, question: ask.question.trim(), sources })
  } catch (error) {
    result = { ok: false, error: errorText(error) }
  }
  if (state.ask !== ask || run !== askRun || generation !== state.sourceGeneration || state.source !== source) return
  ask.status = result.ok ? 'done' : 'error'
  if (result.ok) ask.answer = result.answer
  else ask.error = result.error
  changed()
}

// The answer with its numbered sources and who wrote it, for pasting elsewhere.
export async function copyAnswer() {
  const a = state.ask?.answer
  if (!a) return
  const lines = a.sources.map(s => `[${s.n}] ${s.project} — ${s.title} (${s.path})`)
  const text = `${a.question ? `Q: ${a.question}\n\n` : ''}${a.text}\n\nSources:\n${lines.join('\n')}\n\nWritten by ${a.model}, ${fmtStamp(a.atMs, Date.now())}, from my projects hub.`
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied the answer and its sources')
  } catch {
    toast("Couldn't copy here")
  }
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
  // What's in the field when it's on screen, even if it's been emptied; the draft only for a field that isn't there.
  const value = (id        , fallback        ) => {
    const field = document.getElementById(id)                           
    return (field ? field.value : fallback).trim()
  }
  settings.repo = value('set-repo', state.settingsDraft.repo)
  settings.token = value('set-token', state.settingsDraft.token)
  settings.apiBase = value('set-api', state.settingsDraft.apiBase) || 'https://api.github.com'
  localStorage.setItem('hub.github', JSON.stringify(settings))
  state.settingsDraft = { ...settings }
  // Any saved change, including one that leaves the app unconfigured, retires the old connection and what it showed,
  // so a cleared token or repository can't keep being used by a refresh or the note sender.
  replaceSource(null)
  if (!isConfigured()) {
    state.settingsMessage = 'Fill in the repository as owner/name, and the token.'
    return changed()
  }
  state.source = connectGitHub()
  state.settingsMessage = 'Connecting…'
  changed()
  await loadAll()
  if (state.isOffline) {
    state.settingsMessage = `Offline: showing the saved copy of ${settings.repo} from ${new Date(state.loadedAt).toLocaleString('en-GB')}. It will connect when there's a signal.`
  } else if (state.error) {
    state.settingsMessage = state.error
  } else {
    state.settingsMessage = `Connected to ${settings.repo}: ${state.data?.projects.length ?? 0} projects, ${state.notes.length} notes.`
    // First-run setup moves straight on to the projects, so say so there too.
    toast(state.settingsMessage)
    await flushQueue()
  }
  changed()
}

// Setup's one-tap step: take the token just copied on GitHub's page and connect with it.
export async function pasteAndConnect() {
  let text = ''
  try {
    text = (await navigator.clipboard.readText()).trim()
  } catch {
    // Refused, or no clipboard access in this browser.
  }
  if (!text) {
    state.settingsMessage = "Couldn't read the clipboard. Long-press the Token box, choose Paste, then Connect."
    return changed()
  }
  // Only something shaped like a GitHub token is saved; anything else copied by mistake stays out of storage.
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (!isLocal && !/^(?:github_pat_|ghp_)\w+$/.test(text)) {
    state.settingsMessage = "That doesn't look like a GitHub token (they start github_pat_). Copy the token from GitHub's page and try again."
    return changed()
  }
  state.settingsDraft.token = text
  const field = document.getElementById('set-token')                           
  if (field) field.value = text
  await saveSettings()
}

// Other open windows of the app reload when the token or a reset changes (see app.ts), so none keeps using it.
export function forgetToken() {
  replaceSource(null)
  settings.token = ''
  localStorage.setItem('hub.github', JSON.stringify(settings))
  state.settingsDraft = { ...settings }
  state.settingsMessage = 'Token removed from this phone. Saved notes and the offline copy are still here.'
  changed()
}

// Everything the app keeps on this device: settings, token, unsent notes, offline copies, preferences. Requests
// already running are stopped, and a new reset marker ('hub.epoch') means any source created before now refuses to
// write an offline copy or send a note afterwards, in this window or another.
export async function removeAllData() {
  const unsent = readQueue().length
  const warning = unsent > 0 ? `\n\n${unsent} note${unsent === 1 ? " hasn't" : "s haven't"} been sent yet and will be lost.` : ''
  if (!confirm(`Remove the token, settings, offline copies and unsent notes from this device?${warning}`)) return
  replaceSource(null)
  const keys           = [...snapshotKeys()]
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith(QUEUE_PREFIX) || key.startsWith('hub.'))) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
  localStorage.setItem('hub.epoch', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  Object.assign(settings, { token: '', repo: '', apiBase: 'https://api.github.com' })
  state.settingsDraft = { ...settings }
  state.draft = { ...EMPTY_DRAFT }
  refreshQueue()
  // The app's own offline copy of its pages (hub-* caches) holds no data; it's cleared too, and the page says if not.
  let cacheNote = ''
  if ('caches' in globalThis) {
    const isHub = (n        ) => n.startsWith('hub-')
    try {
      await Promise.all((await caches.keys()).filter(isHub).map(n => caches.delete(n)))
      if ((await caches.keys()).some(isHub)) throw new Error('still there')
    } catch {
      cacheNote = " The app's cached pages couldn't be cleared; they hold no notes or project data."
    }
  }
  state.settingsMessage = `The token, settings, offline copies and unsent notes have been removed from this device.${cacheNote} The token itself stays valid until you revoke it on GitHub.`
  changed()
}

// Notes held for a repository other than the current one: send them here instead (explicitly), or discard them.
export async function sendHeldHere(id        ) {
  const item = readQueue().find(q => q.id === id)
  const dest = state.source?.dest
  if (!item || !dest) return
  const question =
    item.dest === UNKNOWN_DEST
      ? `Send "${item.title}" to ${settings.repo}? It was saved by an earlier version of the app, which didn't record which repository it was for.\n\n${item.text.slice(0, 400)}`
      : `Send "${item.title}" to ${settings.repo} instead of the repository it was written for?\n\n${item.text.slice(0, 400)}`
  if (!confirm(question)) return
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

                      
