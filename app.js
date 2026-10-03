// Projects hub web UI. The same page runs on the desktop (served by app/server.ts, reading the local clone, with
// live Codeg work and summaries) and on the phone (published on GitHub Pages, reading claude-profile from GitHub
// and capturing notes). Which one it is comes from whether the hub server answers.
import {
  activityChart,
  ageLabel,
  boldVerdicts,
  dayKeyOf,
  fmtDay,
  fmtStamp,
  FLAGS,
  formatNote,
  freshTone,
  HEX,
  kpis,
  liveFor,
  looksLikeSecret,
  MACHINES,
  NEEDS_ATTENTION,
  notesBehind,
  pad,
  readableRows,
  resolvePath,
  ROW_MARKS,
  sorter,
  SORTS,
} from './core.js'
                                                                                            
import { escapeHtml as esc, inline, renderMarkdown } from './markdown.js'
                                                 
import { githubSource, localSource, snapshotAge, snapshotProjects } from './source.js'
                                                                                        

                                                                                          
                                
                                                                                             
// A note saved on the phone and not yet on GitHub. Its path is fixed when it's saved, so a retry can't duplicate it.
                                                                                                                             

const REFRESH_MS = 2 * 60 * 1000
const DEFAULT_FILTERS          = { machine: 'all', attention: false, query: '', sort: 'checkpoint' }
const EMPTY_DRAFT        = { kind: 'note', project: '', title: '', body: '', source: '' }

function readJson   (key        , fallback   )    {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw)     )
  } catch {
    return fallback
  }
}

const settings                 = { token: '', repo: '', apiBase: 'https://api.github.com', ...readJson                         ('hub.github', {}) }
const isConfigured = () => settings.token.trim() !== '' && /^[\w.-]+\/[\w.-]+$/.test(settings.repo.trim())

const state = {
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

const view = document.getElementById('view')               
const nav = document.getElementById('nav')               
const loadedLabel = document.getElementById('loaded')               

// ---------- data ----------

const errorText = (error         ) => (error instanceof Error ? error.message : String(error))

async function loadAll() {
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

async function loadRecord(path        ) {
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

function saveQueue() {
  localStorage.setItem('hub.queue', JSON.stringify(state.queue))
}

// Sends waiting notes in order; stops at the first failure and says why. Safe to call any time.
let isFlushing = false
async function flushQueue() {
  const create = state.source?.createFile
  if (!create || state.queue.length === 0 || isFlushing) return
  isFlushing = true
  let sent = 0
  try {
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
        break
      }
    }
  } finally {
    isFlushing = false
  }
  if (sent > 0) {
    toast(sent === 1 ? 'Note sent' : `${sent} notes sent`)
    await loadAll()
  }
  render()
}

// ---------- routes ----------

                                                                                                                                                  

function currentRoute()        {
  const hash = location.hash
  if (hash.startsWith('#/record/')) return { name: 'record', path: decodeURIComponent(hash.slice(9)) }
  if (hash === '#/inbox') return { name: 'inbox' }
  if (hash.startsWith('#/capture')) return { name: 'capture', project: decodeURIComponent(hash.slice(10)) }
  if (hash === '#/settings') return { name: 'settings' }
  return { name: 'list' }
}

const recordHref = (path        ) => `#/record/${encodeURIComponent(path)}`
const captureHref = (project = '') => `#/capture${project ? `/${encodeURIComponent(project)}` : ''}`

// ---------- small pieces ----------

const dot = (tone      , glyph = '●') => `<span class="mark" style="color:${HEX[tone]}">${glyph}</span>`
const machineName = (m         ) => (m === 'desktop' ? 'Desktop' : 'Laptop')
const projectName = (file        ) => state.data?.projects.find(p => p.file === file)?.name ?? file.split('/').pop()?.replace(/\.md$/, '') ?? file
const notesFor = (file        ) => state.notes.filter(n => n.project === file)
const queuedFor = (file        ) => state.queue.filter(q => q.project === file)

function linkResolver(docPath        )               {
  const dir = docPath.split('/').slice(0, -1).join('/')
  return href => {
    if (/^https?:\/\//i.test(href)) return { href, isInternal: false }
    if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return null
    const target = resolvePath(dir, href.split('#')[0])
    return target && target.endsWith('.md') ? { href: recordHref(target), isInternal: true } : null
  }
}

function chips(p         )         {
  return FLAGS.filter(x => p.flags.includes(x.flag))
    .map(x => `<span class="chip">${dot(x.tone, x.icon)} ${esc(x.label)}</span>`)
    .join('')
}

function liveBox(source      , now        , isCompact         )         {
  const entries = source.entries.slice(0, state.liveMore ? source.entries.length : 4)
  const trees = source.worktrees.slice(0, isCompact ? 2 : 6)
  const latest = source.entries[0]
  const resolve = linkResolver('')
  return `
    <section class="card live">
      <div class="live-head">
        ${dot('good', '⚡')} <strong>${esc(source.label)}</strong>
        ${source.latestMs !== null ? `<span class="muted">last activity ${esc(fmtStamp(source.latestMs, now))} (${esc(ageLabel(source.latestMs, now, true))} ago)</span>` : ''}
      </div>
      ${isCompact && latest ? `<div class="clip muted">${esc(latest.text.replace(/\*\*|`/g, ''))}</div>` : ''}
      ${
        isCompact
          ? ''
          : `<div class="log">${entries
              .map(x => `<div class="log-entry"><span class="when">${esc(fmtStamp(x.atMs, now))}</span> ${inline(boldVerdicts(x.text), resolve)}</div>`)
              .join('')}</div>`
      }
      ${trees
        .map(
          w => `<div class="tree"><span class="muted">⎇</span> <span>${esc(w.branch || w.name)}</span>
            <span class="clip muted">${w.lastCommitMs !== null ? `${esc(fmtStamp(w.lastCommitMs, now))} · ` : ''}${esc(w.subject)}${w.changed > 0 ? ` · ${w.changed} uncommitted` : ''}</span></div>`,
        )
        .join('')}
      ${
        !isCompact && source.memoryFiles.length > 0
          ? `<div class="memory"><span class="muted">Coordinator memory:</span> ${source.memoryFiles
              .map(m => `<a href="${recordHref(m.path)}">${esc(m.path.split('/').pop() ?? m.path)}</a> <span class="muted">(${esc(fmtStamp(m.mtimeMs, now))})</span>`)
              .join(' · ')}</div>`
          : ''
      }
      <div class="actions">
        ${
          isCompact
            ? `<a class="link" href="${recordHref(source.records[0])}">Open record →</a>`
            : `<button class="link" data-action="live-more">${state.liveMore ? 'Fewer log entries' : `All ${source.entries.length} recent log entries`}</button>
               <button class="link" data-action="copy" data-text="${esc(source.logPath)}">Copy log path</button>`
        }
      </div>
    </section>`
}

function noteCard(n               , isQueued         )         {
  const resolve = linkResolver(n.path)
  const project = n.project ? `<a href="${recordHref(n.project)}">${esc(projectName(n.project))}</a>` : ''
  const captured = 'captured' in n ? n.captured : fmtStamp(n.createdAt, Date.now())
  const source = 'source' in n && n.source ? `<div class="clip"><a href="${esc(n.source)}" target="_blank" rel="noopener noreferrer">${esc(n.source)}</a></div>` : ''
  return `
    <article class="card note ${isQueued ? 'queued' : ''}">
      <div class="note-head">
        <span class="mark" title="${n.kind === 'idea' ? 'Idea' : 'Note'}">${n.kind === 'idea' ? '◇' : '✎'}</span>
        <strong>${esc(n.title)}</strong>
        <span class="muted">${esc(captured)}${project ? ' · ' : ''}${project}${isQueued ? ' · waiting to send' : ''}</span>
        ${!isQueued && state.mode === 'local' ? `<a class="link muted" href="${recordHref(n.path)}">file</a>` : ''}
      </div>
      <div class="md">${renderMarkdown(n.body, resolve)}</div>
      ${source}
    </article>`
}

// ---------- list ----------

function renderList(data      )         {
  const f = state.filters
  const now = data.now
  const query = f.query.toLowerCase()
  const isMatch = (p         ) =>
    (f.machine === 'all' || p.machine === f.machine) &&
    (!f.attention || p.flags.some(x => NEEDS_ATTENTION.includes(x))) &&
    (query === '' || `${p.name} ${p.state}`.toLowerCase().includes(query))
  const shown = [...data.projects].sort(sorter(f.sort)).filter(isMatch)
  const k = kpis(data.projects, data.live, now)
  const width = Math.max(260, Math.min(720, view.clientWidth - 40))
  const chart = activityChart(data.projects, now, width)
  const active = data.live.filter(s => s.latestMs !== null && now - s.latestMs < 3 * 24 * 60 * 60 * 1000)

  const row = (p         ) => {
    const isEdited = f.sort === 'edited'
    const ms = isEdited ? p.editedMs : p.checkedMs
    const tone = freshTone(ms === null ? null : isEdited ? dayKeyOf(ms) : ms, now)
    const behind = notesBehind(p, data.live)
    const noteCount = p.file ? notesFor(p.file).length + queuedFor(p.file).length : 0
    const href = p.file ? recordHref(p.file) : '#/'
    return `
      <a class="row" href="${href}">
        <span class="age ${tone === 'muted' ? 'muted' : ''}">${dot(tone, ms === null ? '○' : isEdited ? '✎' : '●')} ${esc(ageLabel(ms, now, isEdited))}</span>
        <span class="row-main">
          <span class="row-title">
            <span class="name">${esc(p.name)}</span>
            ${p.pairFile ? '<span class="muted" title="Also has a record on the other machine">⇄</span>' : ''}
            ${behind && behind.latestMs !== null ? `<span class="chip">${dot('good', '⚡')} active ${esc(ageLabel(behind.latestMs, now, true))} ago · notes behind</span>` : ''}
            ${noteCount > 0 ? `<span class="chip">✎ ${noteCount} phone note${noteCount === 1 ? '' : 's'}</span>` : ''}
            ${chips(p)}
          </span>
          <span class="state">${esc(p.state)}</span>
        </span>
      </a>`
  }

  return `
    <div class="kpis">
      <span>${dot('good')} ${k.fresh} in the last 2 days</span>
      <span>${dot('warning')} ${k.week} this week</span>
      <span>${dot('muted')} ${k.older} older</span>
      ${k.undated > 0 ? `<span>${dot('muted', '○')} ${k.undated} undated</span>` : ''}
      ${k.behind > 0 ? `<span>${dot('good', '⚡')} ${k.behind} with newer local work</span>` : ''}
    </div>

    <section class="card chart">
      <div class="muted">Checkpoints written per day, last 14 days${chart.outside > 0 ? ` (${chart.outside} earlier or undated not shown)` : ''}</div>
      ${chart.source}
      <div class="legend"><span>${dot('desktop', '■')} Desktop</span><span>${dot('laptop', '■')} Laptop</span></div>
    </section>

    ${active.map(s => liveBox(s, now, true)).join('')}

    <div class="toolbar">
      <input id="query" type="search" placeholder="Filter by name or state…  ( / )" value="${esc(f.query)}" autocomplete="off">
      <div class="segmented">
        ${(['all', 'desktop', 'laptop']         )
          .map(m => `<button data-action="machine" data-value="${m}" class="${f.machine === m ? 'on' : ''}">${m === 'all' ? 'All' : machineName(m)}</button>`)
          .join('')}
      </div>
      <button data-action="attention" class="toggle ${f.attention ? 'on' : ''}" title="Shortcut: a">⚑ Needs attention (${k.attention})</button>
      <label class="sort">Sort
        <select id="sort">${SORTS.map(s => `<option value="${s.value}" ${s.value === f.sort ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      </label>
    </div>

    ${shown.length === 0 ? '<p class="muted">No projects match. <button class="link" data-action="clear">Clear filters</button></p>' : ''}

    ${MACHINES.map(machine => {
      const rows = shown.filter(p => p.machine === machine)
      if (rows.length === 0) return ''
      return `
        <section class="group">
          <h2>${dot(machine)} ${machineName(machine)} <span class="muted">${rows.length} of ${data.projects.filter(p => p.machine === machine).length}</span></h2>
          ${rows.map(row).join('')}
        </section>`
    }).join('')}`
}

// ---------- record ----------

function rowsHtml(md        , resolve              )         {
  return readableRows(md)
    .map(r => {
      if (r.kind === 'md') return `<div class="md">${renderMarkdown(r.text, resolve)}</div>`
      const mark = ROW_MARKS[r.tone]
      return `<div class="r ${r.tone === 'evidence' ? 'muted' : ''}" style="--depth:${r.depth}">
        <span class="mark" style="color:${HEX[mark.tone]}" title="${esc(mark.label)}">${mark.glyph}</span>
        <div>${inline(boldVerdicts(r.text), resolve)}</div></div>`
    })
    .join('')
}

function briefPrompt(p         , behind                  , worktreeRoot        )         {
  const pair = p.pairFile ? ` and ~/claude-profile/${p.pairFile}` : ''
  const local =
    behind && worktreeRoot
      ? ` Local work is newer than the notes: also read the latest entries of ${behind.logPath} and check the worktrees under ${worktreeRoot}.`
      : ''
  return (
    `Brief me on ${p.name} from the shared profile. Read ~/claude-profile/${p.file}${pair}.${local} ` +
    'Give me the current state, the next action, any blockers or holds, and anything that looks stale. ' +
    "Read-only: don't edit files or resume any work."
  )
}

function catchUpPrompt(p         , source      , worktreeRoot        )         {
  return (
    `The shared-profile record ~/claude-profile/${p.file} is behind local work. Read the record, then the ` +
    `entries of ${source.logPath} since its last checkpoint and the git state of the worktrees under ` +
    `${worktreeRoot}. Draft a dated checkpoint for the top of the record in the format profile.md asks for ` +
    '(updated date and evidence; owning machine and provider roles; state; next action or hold; read-first), ' +
    "and show me the draft before writing anything. Don't touch the worktrees or the programme folder."
  )
}

function renderRecord(doc            , data             )         {
  const now = data?.now ?? Date.now()
  const p = data?.projects.find(x => x.file === doc.path)
  const sources = data?.live ?? []
  const source = liveFor(doc.path, sources)
  const behind = p ? notesBehind(p, sources) : undefined
  const desktop = data?.desktop
  const resolve = linkResolver(doc.path)
  const md = (text        ) => `<div class="md">${renderMarkdown(text, resolve)}</div>`
  const isAllOpen = doc.sections.every((_, i) => state.open.has(String(i)))
  const other                      = p ? (p.machine === 'desktop' ? 'laptop' : 'desktop') : undefined
  const recordNotes = notesFor(doc.path)
  const recordQueue = queuedFor(doc.path)
  const canCapture = Boolean(state.source?.createFile)

  return `
    <div class="crumbs">
      <button data-action="back" title="Shortcut: b">← ${history.length > 1 ? 'Back' : 'All projects'}</button>
      <span class="muted clip">${esc(doc.path)}</span>
    </div>
    <h2 class="title">${esc(p ? p.name : doc.title)}</h2>
    ${
      p
        ? `<div class="meta">${dot(p.machine)} ${machineName(p.machine)} record · checkpoint ${p.checkedMs !== null ? `${esc(fmtDay(p.checkedMs))} (${esc(ageLabel(p.checkedMs, now, false))})` : 'not dated'}
            · edited ${p.editedMs !== null ? `${esc(fmtStamp(p.editedMs, now))} on ${esc(p.editedOn)}` : 'unknown'}</div>
           ${p.flags.length > 0 ? `<div class="chips">${chips(p)}</div>` : ''}
           <section class="card"><div class="label">Index row</div>${md(p.state)}</section>`
        : ''
    }
    ${source && (behind || doc.path === source.records[0]) ? liveBox(source, now, false) : ''}
    ${
      doc.next || doc.readFirst
        ? `<section class="card accent">
            ${doc.next ? `<div class="label strong">Next</div>${md(doc.next)}` : ''}
            ${doc.readFirst ? `<div class="label strong">Read first</div>${md(doc.readFirst)}` : ''}
          </section>`
        : ''
    }
    <div class="actions">
      ${canCapture && p ? `<a class="button primary" href="${captureHref(doc.path)}">✎ Add note</a>` : ''}
      ${p && desktop ? `<button class="${canCapture ? '' : 'primary'}" data-action="copy" data-text="${esc(briefPrompt(p, behind, desktop.worktreeRoot))}" title="Paste into Claude">Copy “brief me” prompt</button>` : ''}
      ${p && behind && desktop ? `<button data-action="copy" data-text="${esc(catchUpPrompt(p, behind, desktop.worktreeRoot))}">Copy catch-up prompt</button>` : ''}
      ${desktop ? `<button data-action="copy" data-text="${esc(`${desktop.repoWindows}\\${doc.path.split('/').join('\\')}`)}">Copy path</button>` : ''}
      ${p && p.pairFile && other ? `<a class="button" href="${recordHref(p.pairFile)}">${machineName(other)} record →</a>` : ''}
    </div>
    ${
      recordNotes.length + recordQueue.length > 0
        ? `<section class="notes"><div class="label">Phone notes (${recordNotes.length + recordQueue.length})</div>
            ${recordQueue.map(q => noteCard(q, true)).join('')}${recordNotes.map(n => noteCard(n, false)).join('')}</section>`
        : ''
    }
    ${doc.preamble ? md(doc.preamble) : ''}
    <div class="toolbar small">
      ${doc.sections.length > 1 ? `<button class="link" data-action="toggle-all">${isAllOpen ? 'Collapse all sections' : 'Expand all sections'}</button>` : ''}
      <button class="link muted" data-action="layout">${state.layout === 'readable' ? 'Show as written' : 'Readable layout'}</button>
      ${
        state.layout === 'readable'
          ? `<span class="legend">${(['good', 'warning', 'critical', 'evidence']         )
              .map(t => `<span><span class="mark" style="color:${HEX[ROW_MARKS[t].tone]}">${ROW_MARKS[t].glyph}</span> ${esc(ROW_MARKS[t].label)}</span>`)
              .join('')}</span>`
          : ''
      }
    </div>
    ${doc.sections
      .map((s             , i) => {
        const isOpen = state.open.has(String(i))
        const isCurrent = i === 0 || /^(?:current|latest)\b/i.test(s.title)
        const isPending = state.pending.has(i)
        const canSummarise = Boolean(state.source?.summarise) && Boolean(s.hash)
        return `
          <section class="card section ${isCurrent ? 'accent' : ''}">
            <div class="section-bar">
              <button class="section-head" data-action="section" data-value="${i}" aria-expanded="${isOpen}">${isOpen ? '▾' : '▸'} ${esc(s.title)}</button>
              ${canSummarise && !s.summary && !isPending ? `<button class="link muted" data-action="summarise" data-value="${i}">✦ Summarise</button>` : ''}
              ${isPending ? '<span class="muted">✦ Summarising… (can take a minute)</span>' : ''}
            </div>
            ${
              s.summary
                ? `<div class="card ai">
                    <div class="summary-head"><strong class="ai-ink">✦ Summary</strong>
                      <span class="muted">written by ${esc(s.summary.model)}${s.summary.note ? ` (fallback: ${esc(s.summary.note)})` : ''}; check it against the record</span>
                      ${isPending || !canSummarise ? '' : `<button class="link muted" data-action="summarise" data-value="${i}" data-redo="1">Redo</button>`}</div>
                    ${md(s.summary.text)}
                  </div>`
                : ''
            }
            ${isOpen ? (s.body === '' ? '<p class="muted">Empty section.</p>' : state.layout === 'readable' ? `<div class="rows">${rowsHtml(s.body, resolve)}</div>` : md(s.body)) : ''}
          </section>`
      })
      .join('')}
    ${
      doc.history.length > 0
        ? `<section class="history"><div class="label">Recent edits to this record</div>
            ${doc.history
              .map(c => `<div>${c.by === 'desktop' || c.by === 'laptop' ? dot(c.by) : '<span class="muted">·</span>'} <span class="muted">${esc(fmtStamp(c.atMs, now))} · ${esc(c.by)}</span></div>`)
              .join('')}</section>`
        : ''
    }`
}

// ---------- inbox, capture, settings ----------

function renderInbox()         {
  const kind = state.inboxKind
  const notes = state.notes.filter(n => kind === 'all' || n.kind === kind)
  const queued = state.queue.filter(q => kind === 'all' || q.kind === kind)
  const canCapture = Boolean(state.source?.createFile)
  return `
    <div class="crumbs"><a class="button" href="#/">← All projects</a>${canCapture ? `<a class="button primary" href="${captureHref()}">✎ New note</a>` : ''}</div>
    <h2 class="title">Inbox</h2>
    <p class="muted">${
      state.mode === 'local'
        ? 'Notes and ideas captured on the phone, as of this clone’s last profile sync.'
        : 'Notes and ideas from this phone, stored in claude-profile under memory/phone/.'
    }</p>
    <div class="segmented">
      ${(['all', 'note', 'idea']         )
        .map(k => `<button data-action="inbox-kind" data-value="${k}" class="${kind === k ? 'on' : ''}">${k === 'all' ? 'All' : k === 'note' ? 'Notes' : 'Ideas'}</button>`)
        .join('')}
    </div>
    ${
      queued.length > 0
        ? `<section class="queue"><div class="label">Waiting to send (${queued.length})${state.queueError ? `: ${esc(state.queueError)}` : ''}
            <button class="link" data-action="retry">Retry now</button></div>${queued.map(q => noteCard(q, true)).join('')}</section>`
        : ''
    }
    ${notes.map(n => noteCard(n, false)).join('') || (queued.length === 0 ? '<p class="muted">Nothing here yet.</p>' : '')}`
}

function renderCapture()         {
  const d = state.draft
  const projects = state.data?.projects.filter(p => p.file) ?? []
  return `
    <div class="crumbs"><button data-action="back">← Back</button></div>
    <h2 class="title">New ${d.kind === 'idea' ? 'idea' : 'note'}</h2>
    <div class="segmented">
      <button data-action="draft-kind" data-value="note" class="${d.kind === 'note' ? 'on' : ''}">Note on a project</button>
      <button data-action="draft-kind" data-value="idea" class="${d.kind === 'idea' ? 'on' : ''}">Idea</button>
    </div>
    <form class="form" id="capture" autocomplete="off">
      ${
        d.kind === 'note'
          ? `<label>Project
              <select id="draft-project" required>
                <option value="">Choose a project…</option>
                ${MACHINES.map(
                  m => `<optgroup label="${machineName(m)}">${projects
                    .filter(p => p.machine === m)
                    .map(p => `<option value="${esc(p.file)}" ${p.file === d.project ? 'selected' : ''}>${esc(p.name)}</option>`)
                    .join('')}</optgroup>`,
                ).join('')}
              </select></label>`
          : ''
      }
      <label>Title <span class="muted">(optional)</span><input id="draft-title" value="${esc(d.title)}" maxlength="120"></label>
      <label>${d.kind === 'idea' ? 'Idea' : 'Note'}<textarea id="draft-body" rows="8" required>${esc(d.body)}</textarea></label>
      <label>Link <span class="muted">(optional)</span><input id="draft-source" type="url" value="${esc(d.source)}" placeholder="https://…"></label>
      <div class="actions">
        <button class="primary" type="submit">Save</button>
        <button type="button" data-action="clear-draft">Clear</button>
      </div>
      <p class="muted small">Saved straight to the phone and sent to claude-profile (memory/phone/) when there's a connection. Don't put passwords or tokens in notes.</p>
    </form>`
}

function renderSettings()         {
  if (state.mode === 'local') {
    return `<h2 class="title">Settings</h2><p>The desktop app reads your local claude-profile clone and needs no settings.</p><p><a href="#/">← All projects</a></p>`
  }
  return `
    <h2 class="title">Settings</h2>
    <p>This app reads your private <code>claude-profile</code> repo from GitHub with a fine-grained token that stays on this phone.</p>
    <form class="form" id="settings" autocomplete="off">
      <label>Repository<input id="set-repo" value="${esc(settings.repo)}" placeholder="owner/name" autocapitalize="off" spellcheck="false"></label>
      <label>Token<input id="set-token" type="password" value="${esc(settings.token)}" placeholder="github_pat_…" autocapitalize="off" spellcheck="false"></label>
      <details><summary>Advanced</summary><label>API address<input id="set-api" value="${esc(settings.apiBase)}" spellcheck="false"></label></details>
      <div class="actions">
        <button class="primary" type="submit">Save and connect</button>
        ${settings.token ? '<button type="button" data-action="forget-token">Forget token</button>' : ''}
      </div>
      ${state.settingsMessage ? `<p class="${state.settingsMessage.startsWith('Connected') ? '' : 'error'}">${esc(state.settingsMessage)}</p>` : ''}
    </form>
    <section class="card">
      <div class="label strong">Making the token</div>
      <p>GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: only <code>claude-profile</code>.
      Permissions: <strong>Contents: Read and write</strong> (Metadata: Read is added automatically). Revoke it there if the phone is lost.</p>
    </section>`
}

// ---------- render and events ----------

function renderNav() {
  const inboxCount = state.notes.length + state.queue.length
  nav.innerHTML = `
    <a class="button" href="#/inbox" title="Notes and ideas from the phone">Inbox${inboxCount > 0 ? ` (${inboxCount})` : ''}</a>
    ${state.source?.createFile ? `<a class="button primary" href="${captureHref()}">✎ Note</a>` : ''}
    ${state.mode === 'github' ? '<a class="button" href="#/settings" title="Settings">⚙</a>' : ''}
    <button data-action="refresh" title="Shortcut: r">↻</button>`
}

function render() {
  const focused = document.activeElement
  const caret = focused instanceof HTMLInputElement && focused.id === 'query' ? focused.selectionStart : null
  const route = currentRoute()

  let html = ''
  if (route.name === 'settings' || (state.mode === 'github' && !isConfigured())) {
    html = renderSettings()
  } else if (route.name === 'inbox') {
    html = renderInbox()
  } else if (route.name === 'capture') {
    html = renderCapture()
  } else if (route.name === 'record') {
    html = state.recordError
      ? `<p class="error">${esc(state.recordError)}</p><p><a href="#/">← All projects</a></p>`
      : state.record
        ? renderRecord(state.record, state.data)
        : '<p class="muted">Loading…</p>'
  } else if (state.data) {
    html = renderList(state.data)
  } else {
    html = state.error ? `<p class="error">${esc(state.error)}</p>` : '<p class="muted">Loading…</p>'
  }
  const banner = state.isOffline
    ? `<p class="banner">Offline: showing projects as of ${esc(fmtStamp(state.loadedAt, Date.now()))}.</p>`
    : state.error && state.data && route.name === 'list'
      ? `<p class="banner">Last refresh failed: ${esc(state.error)}</p>`
      : ''
  view.innerHTML = banner + html
  renderNav()

  const at = new Date(state.loadedAt)
  loadedLabel.textContent = state.loadedAt ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : ''
  loadedLabel.title = state.loadedAt ? `Loaded ${at.toLocaleString('en-GB')}; refreshes every 2 min` : ''

  if (caret !== null) {
    const input = document.getElementById('query')                           
    input?.focus()
    input?.setSelectionRange(caret, caret)
  }
}

function setFilters(change                  ) {
  state.filters = { ...state.filters, ...change }
  const { query: _query, ...kept } = state.filters
  localStorage.setItem('hub.filters', JSON.stringify(kept))
  render()
}

async function route() {
  const r = currentRoute()
  if (r.name === 'record') {
    // Show "Loading…" rather than the previous record while this one is fetched.
    state.record = null
    state.recordError = ''
    render()
    await loadRecord(r.path)
    window.scrollTo(0, 0)
  } else if (r.name === 'capture' && r.project) {
    state.draft = { ...state.draft, kind: 'note', project: r.project }
  }
  render()
}

async function refresh() {
  await flushQueue()
  await loadAll()
  const r = currentRoute()
  if (r.name === 'record') await loadRecord(r.path)
  render()
}

async function summarise(index        , isRedo         ) {
  const doc = state.record
  const ask = state.source?.summarise
  if (!doc || !ask || state.pending.has(index)) return
  const path = doc.path
  state.pending.add(index)
  render()
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
    render()
  }
}

async function saveDraft() {
  const d = state.draft
  if (d.body.trim() === '') return toast('Write something first')
  if (d.kind === 'note' && !d.project) return toast('Choose a project, or switch to Idea')
  if (looksLikeSecret(`${d.title}\n${d.body}\n${d.source}`)) {
    return toast("That looks like a password or token, so it wasn't saved. Notes go to GitHub.")
  }
  const file = formatNote(d, Date.now())
  const title = d.title.trim() || d.body.trim().split('\n')[0].slice(0, 80)
  state.queue = [...state.queue, { path: file.path, text: file.text, kind: d.kind, title, project: d.kind === 'note' ? d.project : '', body: d.body.trim(), createdAt: Date.now() }]
  saveQueue()
  const project = d.kind === 'note' ? d.project : ''
  state.draft = { ...EMPTY_DRAFT, kind: d.kind }
  toast('Saved')
  location.hash = project ? recordHref(project) : '#/inbox'
  await flushQueue()
}

async function saveSettings() {
  const value = (id        ) => (document.getElementById(id)                           )?.value.trim() ?? ''
  settings.repo = value('set-repo')
  settings.token = value('set-token')
  settings.apiBase = value('set-api') || 'https://api.github.com'
  localStorage.setItem('hub.github', JSON.stringify(settings))
  if (!isConfigured()) {
    state.settingsMessage = 'Fill in the repository as owner/name, and the token.'
    return render()
  }
  state.source = githubSource(settings)
  state.settingsMessage = 'Connecting…'
  render()
  await loadAll()
  if (state.error && !state.isOffline) {
    state.settingsMessage = state.error
  } else {
    state.settingsMessage = `Connected: ${state.data?.projects.length ?? 0} projects, ${state.notes.length} notes.`
    await flushQueue()
  }
  render()
}

function toast(text        ) {
  const el = document.getElementById('toast')               
  el.textContent = text
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2800)
}

document.addEventListener('click', async event => {
  const target = (event.target               ).closest('[data-action]')                      
  if (!target) return
  const action = target.dataset.action
  const value = target.dataset.value ?? ''
  if (action === 'machine') setFilters({ machine: value                       })
  else if (action === 'attention') setFilters({ attention: !state.filters.attention })
  else if (action === 'clear') setFilters({ machine: 'all', attention: false, query: '' })
  else if (action === 'refresh') await refresh()
  else if (action === 'back') history.length > 1 ? history.back() : (location.hash = '#/')
  else if (action === 'live-more') {
    state.liveMore = !state.liveMore
    render()
  } else if (action === 'summarise') {
    await summarise(Number(value), target.dataset.redo === '1')
  } else if (action === 'section') {
    if (state.open.has(value)) state.open.delete(value)
    else state.open.add(value)
    render()
  } else if (action === 'toggle-all' && state.record) {
    const all = state.record.sections.map((_, i) => String(i))
    state.open = all.every(k => state.open.has(k)) ? new Set() : new Set(all)
    render()
  } else if (action === 'layout') {
    state.layout = state.layout === 'readable' ? 'raw' : 'readable'
    localStorage.setItem('hub.layout', state.layout)
    render()
  } else if (action === 'inbox-kind') {
    state.inboxKind = value                    
    render()
  } else if (action === 'retry') {
    await flushQueue()
  } else if (action === 'draft-kind') {
    state.draft.kind = value            
    render()
  } else if (action === 'clear-draft') {
    state.draft = { ...EMPTY_DRAFT, kind: state.draft.kind }
    render()
  } else if (action === 'forget-token') {
    settings.token = ''
    localStorage.setItem('hub.github', JSON.stringify(settings))
    state.source = null
    state.settingsMessage = 'Token removed from this phone.'
    render()
  } else if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(target.dataset.text ?? '')
      toast('Copied')
    } catch {
      toast("Couldn't copy here")
    }
  }
})

document.addEventListener('submit', event => {
  const form = event.target                   
  event.preventDefault()
  if (form.id === 'capture') void saveDraft()
  else if (form.id === 'settings') void saveSettings()
})

// Typing updates state without redrawing, so the field keeps its focus; the filter box is the exception.
document.addEventListener('input', event => {
  const el = event.target                    
  if (el.id === 'query') setFilters({ query: el.value })
  else if (el.id === 'draft-title') state.draft.title = el.value
  else if (el.id === 'draft-body') state.draft.body = el.value
  else if (el.id === 'draft-source') state.draft.source = el.value
})

document.addEventListener('change', event => {
  const el = event.target               
  if (el.id === 'sort') setFilters({ sort: (el                     ).value         })
  else if (el.id === 'draft-project') state.draft.project = (el                     ).value
})

document.addEventListener('keydown', event => {
  const el = event.target               
  if (el.matches('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return
  const r = currentRoute()
  if (event.key === 'r') void refresh()
  else if (event.key === 'b' && r.name !== 'list') history.back()
  else if (event.key === 'a' && r.name === 'list') setFilters({ attention: !state.filters.attention })
  else if (event.key === '/' && r.name === 'list') {
    event.preventDefault()
    ;(document.getElementById('query')                           )?.focus()
  }
})

window.addEventListener('hashchange', () => void route())
window.addEventListener('online', () => void refresh())
window.addEventListener('resize', () => {
  if (currentRoute().name === 'list') render()
})

// ---------- start ----------

// The desktop hub server answers /api/health; GitHub Pages (or any static host) doesn't. The server only
// accepts localhost, so anywhere else there's no need to ask.
async function detectMode()                              {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return 'github'
  try {
    const res = await fetch('./api/health', { cache: 'no-store' })
    if (res.ok && ((await res.json())                    ).ok) return 'local'
  } catch {
    // Not the hub server.
  }
  return 'github'
}

// Android's share menu opens the app with ?title=&text=&url=; turn that into a draft.
function takeShare() {
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

state.mode = await detectMode()
document.body.dataset.mode = state.mode
if (state.mode === 'local') {
  state.source = localSource()
} else {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
  if (isConfigured()) state.source = githubSource(settings)
  takeShare()
}
setInterval(() => void refresh(), REFRESH_MS)
render()
await loadAll()
await route()
await flushQueue()
