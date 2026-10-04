// The project list: freshness counts, the 14-day chart, live work, filters, and rows grouped by machine.
import { activityChart, ageLabel, dayKeyOf, freshTone, kpis, MACHINES, NEEDS_ATTENTION, notesBehind, sorter, SORTS } from './core.js'
                                        
import { escapeHtml as esc } from './markdown.js'
import { chips, dot, liveBox, machineName, notesFor, queuedFor } from './parts.js'
import { recordHref } from './routes.js'
                                       
import { state } from './state.js'

export function renderList(data      , width        )         {
  const f = state.filters
  const now = data.now
  const query = f.query.toLowerCase()
  const isMatch = (p         ) =>
    (f.machine === 'all' || p.machine === f.machine) &&
    (!f.attention || p.flags.some(x => NEEDS_ATTENTION.includes(x))) &&
    (query === '' || `${p.name} ${p.state}`.toLowerCase().includes(query))
  const shown = [...data.projects].sort(sorter(f.sort)).filter(isMatch)
  const k = kpis(data.projects, data.live, now)
  const chart = activityChart(data.projects, now, Math.max(260, Math.min(720, width - 40)))
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
      <input id="query" type="search" aria-label="Filter projects by name or state" placeholder="Filter by name or state…  ( / )" value="${esc(f.query)}" autocomplete="off">
      <div class="segmented">
        ${(['all', 'desktop', 'laptop']         )
          .map(m => `<button data-action="machine" data-value="${m}" class="${f.machine === m ? 'on' : ''}" aria-pressed="${f.machine === m}">${m === 'all' ? 'All' : machineName(m)}</button>`)
          .join('')}
      </div>
      <button data-action="attention" class="toggle ${f.attention ? 'on' : ''}" aria-pressed="${f.attention}" title="Shortcut: a">⚑ Needs attention (${k.attention})</button>
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
    }).join('')}
    ${
      state.mode === 'local'
        ? `<p class="muted small keys">Keys: <kbd>/</kbd> filter · <kbd>a</kbd> needs attention · <kbd>r</kbd> refresh · <kbd>b</kbd> back</p>`
        : ''
    }`
}
