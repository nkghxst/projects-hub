// One record: its meta, index row, live work, Next and Read first, actions, phone notes, then its sections in the
// readable or as-written layout, with summaries where the desktop can write them, and its recent edit history.
import { ageLabel, boldVerdicts, currentSectionIndex, fmtDay, fmtStamp, HEX, liveFor, notesBehind, readableRows, ROW_MARKS } from './core.js'
                                                       
import { escapeHtml as esc, inline, renderMarkdown } from './markdown.js'
                                                 
import { chips, dot, linkResolver, liveBox, machineName, noteCard, notesFor, providerTag, queuedFor } from './parts.js'
import { captureHref, recordHref } from './routes.js'
                                                                
import { isPinned, state } from './state.js'

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

// A section card. Only the record's current section gets the accent. A summary shows in full while its section is
// open; a closed section keeps a one-line note that it has one, so older summaries don't compete with the current
// answer. The heading's button says whether the section is open and which content it controls.
function sectionHtml(s             , i        , isCurrent         , resolve              , md                          )         {
  const isOpen = state.open.has(String(i))
  const isPending = Boolean(s.hash) && state.pending.has(s.hash ?? '')
  const canSummarise = Boolean(state.source?.summarise) && Boolean(s.hash)
  const bodyId = `section-${i}`
  const summary = s.summary
  const summaryHtml = !summary
    ? ''
    : isOpen
      ? `<div class="card ai">
          <div class="summary-head"><strong class="ai-ink">✦ Summary</strong>
            <span class="muted">written by ${esc(summary.model)}, ${esc(fmtStamp(summary.atMs, Date.now()))}${summary.note ? ` (fallback: ${esc(summary.note)})` : ''}; check it against the record</span>
            ${isPending || !canSummarise ? '' : `<button class="link muted" data-action="summarise" data-value="${i}" data-redo="1">Redo</button>`}</div>
          ${md(summary.text)}
        </div>`
      : `<button class="link muted small summary-note" data-action="section" data-value="${i}" aria-controls="${bodyId}">✦ Summary available</button>`
  return `
    <section class="card section${isCurrent ? ' current' : ''}">
      <div class="section-bar">
        <h3 class="section-title"><button class="section-head" data-action="section" data-value="${i}" aria-expanded="${isOpen}" aria-controls="${bodyId}">${isOpen ? '▾' : '▸'} ${esc(s.title)}</button></h3>
        ${canSummarise && !summary && !isPending ? `<button class="link muted" data-action="summarise" data-value="${i}">✦ Summarise</button>` : ''}
        ${isPending ? '<span class="muted">✦ Summarising… (can take a minute)</span>' : ''}
      </div>
      <div id="${bodyId}">
        ${summaryHtml}
        ${isOpen ? (s.body === '' ? '<p class="muted">Empty section.</p>' : state.layout === 'readable' ? `<div class="rows">${rowsHtml(s.body, resolve)}</div>` : md(s.body)) : ''}
      </div>
    </section>`
}

export function renderRecord(doc            , data             )         {
  const now = data?.now ?? Date.now()
  const p = data?.projects.find(x => x.file === doc.path)
  const sources = data?.live ?? []
  const source = liveFor(doc.path, sources)
  const behind = p ? notesBehind(p, sources) : undefined
  const desktop = data?.desktop
  const resolve = linkResolver(doc.path)
  const md = (text        ) => `<div class="md">${renderMarkdown(text, resolve)}</div>`
  const isAllOpen = doc.sections.every((_, i) => state.open.has(String(i)))
  const current = currentSectionIndex(doc.sections.map(x => x.title))
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
            · edited ${p.editedMs !== null ? `${esc(fmtStamp(p.editedMs, now))} on ${esc(p.editedOn)}` : 'unknown'} ${providerTag(p)}</div>
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
      ${p ? `<button data-action="pin" data-value="${esc(p.file)}" data-pair="${esc(p.pairFile)}" aria-pressed="${isPinned(p)}">${isPinned(p) ? '★ Pinned' : '☆ Pin to home'}</button>` : ''}
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
    ${doc.sections.map((s, i) => sectionHtml(s, i, i === current, resolve, md)).join('')}
    ${
      doc.history.length > 0
        ? `<section class="history"><div class="label">Recent edits to this record</div>
            ${doc.history
              .map(c => `<div>${c.by === 'desktop' || c.by === 'laptop' ? dot(c.by) : '<span class="muted">·</span>'} <span class="muted">${esc(fmtStamp(c.atMs, now))} · ${esc(c.by)}</span></div>`)
              .join('')}</section>`
        : ''
    }`
}
