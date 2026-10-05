// The catch-up page: every record this device hasn't seen in its current form, pinned projects first, then the newest
// edits. Each says how many parts changed, were added or went; "Show what changed" fetches its recent saved versions,
// finds the one this device last saw, and shows the changed lines and any wait on the owner that appeared or cleared.
import { ageLabel, baseTitle, fmtStamp } from './core.js'
                                                  
import { escapeHtml as esc } from './markdown.js'
import { dot, machineName } from './parts.js'
import { recordHref } from './routes.js'
import { changeOf, diffPrints, seenPrints } from './seen.js'
import { isPinned, state } from './state.js'

export function changedRecords()            {
  return (state.data?.projects ?? [])
    .filter(p => p.file && changeOf(p) !== 'none')
    .sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || (b.editedMs ?? 0) - (a.editedMs ?? 0))
}

// "1 section changed, 1 new, 1 removed", from what this device remembers and the record as it is now.
function counts(p         )         {
  const before = seenPrints(p.file) ?? {}
  const { changed, removed } = diffPrints(before, p.prints)
  // A new title and a gone one with the same base title are one section retitled (a checkpoint's new date).
  const added = [...changed].filter(k => !(k in before))
  const gone = [...removed]
  let retitled = 0
  for (const k of added) {
    const at = gone.findIndex(g => baseTitle(g) === baseTitle(k))
    if (at !== -1) {
      gone.splice(at, 1)
      retitled++
    }
  }
  const isNew = added.length - retitled
  const c = changed.size - added.length + retitled
  const r = gone.length
  const bits           = []
  if (c) bits.push(`${c} section${c === 1 ? '' : 's'} changed`)
  if (isNew) bits.push(c ? `${isNew} new` : `${isNew} new section${isNew === 1 ? '' : 's'}`)
  if (r) bits.push(c || isNew ? `${r} removed` : `${r} section${r === 1 ? '' : 's'} removed`)
  return bits.join(', ')
}

// Changed lines with one unchanged line either side; longer unchanged runs fold into a count.
function linesHtml(lines            )         {
  const keep = lines.map((l, i) => l.kind !== '=' || lines[i - 1]?.kind === '+' || lines[i - 1]?.kind === '-' || lines[i + 1]?.kind === '+' || lines[i + 1]?.kind === '-')
  let html = ''
  let skipped = 0
  const flush = () => {
    if (skipped > 0) html += `<div class="diff-gap muted small">… ${skipped} unchanged line${skipped === 1 ? '' : 's'}</div>`
    skipped = 0
  }
  lines.forEach((l, i) => {
    if (!keep[i]) {
      skipped++
      return
    }
    flush()
    html +=
      l.kind === '+'
        ? `<ins class="diff-line add">${esc(l.text)}</ins>`
        : l.kind === '-'
          ? `<del class="diff-line del">${esc(l.text)}</del>`
          : `<div class="diff-line same">${esc(l.text)}</div>`
  })
  flush()
  return html
}

function detailHtml(file        )         {
  const d = state.changes[file]
  if (!d) return ''
  if (d.status === 'loading') return '<p class="muted small" role="status">Fetching the saved versions…</p>'
  if (d.status === 'error') return `<p class="error" role="alert">${esc(d.error ?? "Couldn't fetch the saved versions")}</p>`
  if (!d.result || !d.base) {
    return `<p class="muted small">This device last looked at a version older than the saved ones checked, so the changes can't be shown line by line. Open the record to read it as it is.</p>`
  }
  const now = Date.now()
  const base = d.base
  const which = d.isExact
    ? ', the one this device last saw'
    : ', the closest saved version to what this device last saw (it saw a state that was never saved on its own)'
  const waits = [
    d.result.waitsAdded.length > 0 ? `<p class="change-waits"><strong>Now waiting on you:</strong> ${d.result.waitsAdded.map(esc).join('; ')}</p>` : '',
    d.result.waitsCleared.length > 0 ? `<p class="change-waits muted"><strong>No longer listed as waiting on you:</strong> ${d.result.waitsCleared.map(esc).join('; ')}</p>` : '',
  ].join('')
  const sections = d.result.sections
    .map(
      s =>
        `<div class="change-section"><h4>${esc(s.title)} <span class="muted small">(${s.kind}${s.was ? `; was “${esc(s.was)}”` : ''})</span></h4><div class="diff">${linesHtml(s.lines)}</div></div>`,
    )
    .join('')
  return `
    <div class="change-detail">
      <p class="muted small">Compared with the version saved ${esc(fmtStamp(base.atMs, now))} on ${esc(base.by)}${which}.</p>
      ${waits}
      ${sections || '<p class="muted small">No differences in the text.</p>'}
    </div>`
}

export function renderChanges()         {
  const list = changedRecords()
  const now = state.data?.now ?? Date.now()
  const canCompare = Boolean(state.source?.versions)
  const head = `
    <div class="crumbs"><button data-action="back" title="Shortcut: b">← Back</button></div>
    <h2 class="title">What's changed</h2>
    <p class="muted small">Records that changed since you last looked at them on this device, pinned projects first. Opening a record, or marking it seen, takes it off this list.</p>`
  if (!state.data) return `${head}<p class="muted">Loading…</p>`
  if (list.length === 0) return `${head}<p class="empty-state">Nothing has changed since you last looked.</p>`
  return `${head}
    <div class="actions"><button type="button" data-action="changes-all-seen">Mark all as seen</button></div>
    ${list
      .map(p => {
        const kind = changeOf(p)
        const isOpen = Boolean(state.changes[p.file]?.isOpen)
        const edited = p.editedMs !== null ? ` · edited ${esc(ageLabel(p.editedMs, now, true))} ago${p.editedOn ? ` on ${esc(p.editedOn)}` : ''}` : ''
        return `
        <section class="card change" aria-label="${esc(p.name)}">
          <div class="change-head">${isPinned(p) ? '<span title="Pinned">★</span> ' : ''}<a href="${recordHref(p.file)}"><strong>${esc(p.name)}</strong></a>
            <span class="muted small">${dot(p.machine)} ${machineName(p.machine)} record${edited}</span></div>
          <p class="muted small">${kind === 'new' ? 'New since this device started keeping track.' : esc(counts(p))}</p>
          <div class="actions">
            ${kind === 'changed' && canCompare ? `<button type="button" data-action="changes-show" data-value="${esc(p.file)}" aria-expanded="${isOpen}">${isOpen ? 'Hide changes' : 'Show what changed'}</button>` : ''}
            <a class="button" href="${recordHref(p.file)}">Open</a>
            <button type="button" data-action="changes-seen" data-value="${esc(p.file)}">Mark as seen</button>
          </div>
          ${isOpen ? detailHtml(p.file) : ''}
        </section>`
      })
      .join('')}`
}
