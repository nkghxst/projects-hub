// One record, opening on its current brief (State, Needs you, Next, Read first, each saying where it came from), then
// live work, actions and phone notes, then the full current checkpoint and the record's other sections, folded, in the
// readable or as-written layout, with summaries where the desktop can write them, and its recent edit history.
import { ageLabel, boldVerdicts, currentSectionIndex, fmtDay, fmtStamp, HEX, liveFor, notesBehind, readableRows, ROW_MARKS } from './core.js'
                                                            
import { escapeHtml as esc, inline, renderMarkdown, termsOnce } from './markdown.js'
                                                 
import { chips, dot, linkResolver, liveBox, machineName, noteCard, notesFor, providerTag, queuedFor } from './parts.js'
import { captureHref, recordHref } from './routes.js'
                                                                
import { isPinned, state } from './state.js'
import { renderSharePanel } from './view-share.js'
import { currentPickUp } from './actions.js'

function rowHtml(r     , resolve              )         {
  if (r.kind === 'md') return `<div class="md">${renderMarkdown(r.text, resolve)}</div>`
  const mark = ROW_MARKS[r.tone]
  return `<div class="r ${r.tone === 'evidence' ? 'muted' : ''}" style="--depth:${r.depth}">
    <span class="mark" style="color:${HEX[mark.tone]}" title="${esc(mark.label)}">${mark.glyph}</span>
    <div>${inline(boldVerdicts(r.text), resolve)}</div></div>`
}

// Runs of two or more evidence lines (paths, hashes, commits) fold into "↳ N evidence lines", so the prose reads on;
// nothing is dropped, and opening the fold shows them as written.
function rowsHtml(md        , resolve              )         {
  const rows = readableRows(md)
  const out           = []
  for (let i = 0; i < rows.length; ) {
    const r = rows[i]
    let j = i
    while (j < rows.length && rows[j].kind === 'line' && (rows[j]                    ).tone === 'evidence') j++
    if (j - i >= 2) {
      out.push(`<details class="evidence"><summary class="muted small">↳ ${j - i} evidence lines</summary>${rows.slice(i, j).map(x => rowHtml(x, resolve)).join('')}</details>`)
      i = j
    } else {
      out.push(rowHtml(r, resolve))
      i++
    }
  }
  return out.join('')
}

// The opening view: what the record says now, from its own current lines, each labelled with where it came from.
// Nothing is inferred: a missing line says "not stated", and a record with no dated current checkpoint says so.
function briefHtml(p         , resolve              )         {
  const src = (where        ) => `<span class="src muted small">(${esc(where)})</span>`
  const state = p.stateLine
    ? `${inline(p.stateLine, resolve)} ${src('current checkpoint')}`
    : `${inline(p.state, resolve)} ${src('index row')}`
  const waits = p.waits ?? []
  const needs =
    waits.length === 0
      ? p.currentTitle
        ? 'Nothing found waiting on you in the current checkpoint.'
        : 'Nothing found waiting on you in the index row or a Next line (this record has no dated current checkpoint).'
      : waits
          .map(w => `<div>${w.isStated ? '' : '<span class="possible">possible</span> '}${esc(w.text)} ${src(w.where === 'index row' || w.where === 'Next' ? w.where : 'current checkpoint')}</div>`)
          .join('')
  const nextSrc =
    p.nextWhere === 'index row'
      ? 'index row'
      : p.isNextCurrent === false
        ? `undated: ${p.nextWhere}`
        : p.isNextQuoted
          ? 'quoted from the current checkpoint'
          : 'current checkpoint'
  return `
    <section class="card brief accent" aria-label="Current brief">
      <div class="brief-head"><strong>Current brief</strong>
        <span class="muted small">${p.currentTitle ? `from “${esc(p.currentTitle)}”` : 'This record has no dated current checkpoint; these lines are the best it states.'}</span></div>
      <dl class="brief-rows">
        <dt>State</dt><dd>${state}</dd>
        <dt>Needs you</dt><dd>${needs}</dd>
        <dt>Next</dt><dd>${p.next ? `${inline(p.next, resolve)} ${src(nextSrc)}${p.status === 'hold' ? ' <span class="src muted small">· the project is on hold: this describes the work, it isn\'t a go-ahead</span>' : ''}` : 'Not stated.'}</dd>
        <dt>Read first</dt><dd>${p.readFirst ? `${inline(p.readFirst, resolve)}${p.isReadFirstQuoted ? ` ${src('quoted from the current checkpoint')}` : ''}` : 'Not stated.'}</dd>
      </dl>
      ${p.stateLine ? `<div class="muted small">Index row: ${inline(p.state, resolve)}</div>` : ''}
    </section>`
}

// Pick up: the prompt for an agent session on the machine that owns the project, and where to paste it.
function pickUpPanel(machine         , name        )         {
  const text = currentPickUp() ?? ''
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return `
    <div class="share-panel card pickup" role="region" aria-label="Pick up">
      <div class="share-head"><strong>Pick up ${esc(name)}</strong> <span class="muted small">for an agent on the ${machine}</span>
        <button type="button" class="link muted" data-action="pickup-close" aria-label="Close the Pick up panel">✕</button></div>
      <p class="muted small">Paste it into a Claude Code session on the ${machine} (Claude app → Code tab → the ${machine}'s card → the project's folder, with <code>claude remote-control</code> running there) or into Codex (ChatGPT → Codex → the ${machine}). The agent reads the record and code itself and waits for your go. For an app without your files, use ↗ Share on the current section instead.</p>
      <pre id="pickup-text" class="share-text" tabindex="0">${esc(text)}</pre>
      <div class="actions">
        <button type="button" class="primary" data-action="pickup-copy">Copy</button>
        ${canShare ? '<button type="button" data-action="pickup-share">Share…</button>' : ''}
      </div>
    </div>`
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
  return termsOnce(() => drawSection(s, i, isCurrent, resolve, md))
}

function drawSection(s             , i        , isCurrent         , resolve              , md                          )         {
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
  const isChanged = state.recordChanged.has(s.title.trim().toLowerCase())
  return `
    <section class="card section${isCurrent ? ' current' : ''}${isChanged ? ' changed' : ''}">
      <div class="section-bar">
        <h3 class="section-title"><button class="section-head" data-action="section" data-value="${i}" aria-expanded="${isOpen}" aria-controls="${bodyId}">${isOpen ? '▾' : '▸'} ${esc(s.title)}</button></h3>
        ${canSummarise && !summary && !isPending ? `<button class="link muted" data-action="summarise" data-value="${i}">✦ Summarise</button>` : ''}
        <button class="link muted" data-action="share-open" data-value="${i}" title="Share this section to Claude, or another app">↗ Share</button>
        ${isPending ? '<span class="muted">✦ Summarising… (can take a minute)</span>' : ''}
        ${isChanged ? '<span class="changed-badge">changed since you last looked</span>' : ''}
      </div>
      ${state.share?.target === 'section' && state.share.index === i ? renderSharePanel() : ''}
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
  // With a dated current checkpoint, the brief is the opening view and the rest is folded beneath it.
  const hasCurrent = doc.sections.some(x => /^(?:current|latest)\b/i.test(x.title))
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
           ${termsOnce(() => briefHtml(p, resolve))}`
        : doc.next || doc.readFirst
          ? `<section class="card accent">
              ${doc.next ? `<div class="label strong">Next</div>${md(doc.next)}` : ''}
              ${doc.readFirst ? `<div class="label strong">Read first</div>${md(doc.readFirst)}` : ''}
            </section>`
          : ''
    }
    ${source && (behind || doc.path === source.records[0]) ? liveBox(source, now, false) : ''}
    <div class="actions">
      ${canCapture && p ? `<a class="button primary" href="${captureHref(doc.path)}">✎ Add note</a>` : ''}
      ${p ? `<button class="${canCapture ? '' : 'primary'}" data-action="pickup-open" aria-expanded="${state.pickUp}" title="A prompt for an agent on the ${p.machine}: read the record and its code, report, then propose">↻ Pick up</button>` : ''}
      ${p && behind && desktop ? `<button data-action="copy" data-text="${esc(catchUpPrompt(p, behind, desktop.worktreeRoot))}">Copy catch-up prompt</button>` : ''}
      ${state.source?.ask ? '<button data-action="ask-record" title="Ask Claude on this desktop, citing this record\'s sections">✦ Ask about this record</button>' : ''}
      ${desktop ? `<button data-action="copy" data-text="${esc(`${desktop.repoWindows}\\${doc.path.split('/').join('\\')}`)}">Copy path</button>` : ''}
      ${p && p.pairFile && other ? `<a class="button" href="${recordHref(p.pairFile)}">${machineName(other)} record →</a>` : ''}
      ${p ? `<button data-action="pin" data-value="${esc(p.file)}" data-pair="${esc(p.pairFile)}" aria-pressed="${isPinned(p)}">${isPinned(p) ? '★ Pinned' : '☆ Pin to home'}</button>` : ''}
    </div>
    ${p && state.pickUp ? pickUpPanel(p.machine, p.name) : ''}
    ${
      recordNotes.length + recordQueue.length > 0
        ? `<section class="notes"><div class="label">Notes (${recordNotes.length + recordQueue.length})</div>
            ${recordQueue.map(q => noteCard(q, true)).join('')}${recordNotes.map(n => noteCard(n, false)).join('')}</section>`
        : ''
    }
    ${
      state.recordRemoved.length > 0 || state.recordChanged.has('#top')
        ? `<p class="changed-note">${[
            state.recordChanged.has('#top') ? 'The text at the top changed since you last looked.' : '',
            state.recordRemoved.length > 0 ? `Removed since you last looked: ${state.recordRemoved.map(t => `“${esc(t)}”`).join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' ')}</p>`
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
    ${
      hasCurrent
        ? `${sectionHtml(doc.sections[current], current, true, resolve, md)}
           ${
             doc.sections.length > 1
               ? `<details class="other-sections" data-key="other-sections"${state.openDetails.has('other-sections') ? ' open' : ''}>
                    <summary>Other sections (${doc.sections.length - 1}): earlier checkpoints, history and reference</summary>
                    ${doc.sections.map((s, i) => (i === current ? '' : sectionHtml(s, i, false, resolve, md))).join('')}
                  </details>`
               : ''
           }`
        : doc.sections.map((s, i) => sectionHtml(s, i, i === current, resolve, md)).join('')
    }
    ${
      doc.history.length > 0
        ? `<section class="history"><div class="label">Recent edits to this record</div>
            ${doc.history
              .map(c => `<div>${c.by === 'desktop' || c.by === 'laptop' ? dot(c.by) : '<span class="muted">·</span>'} <span class="muted">${esc(fmtStamp(c.atMs, now))} · ${esc(c.by)}</span></div>`)
              .join('')}</section>`
        : ''
    }`
}
