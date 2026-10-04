// The home, decision first: what waits on the owner, then next actions, pinned projects, and every project grouped
// by where it stands. The freshness counts, the 14-day chart and live work fold into an Activity area at the bottom.
import { activityChart, ageLabel, dayKeyOf, fmtDay, freshTone, kpis, notesBehind, sorter, SORTS } from './core.js'
                                                       
import { escapeHtml as esc, inline } from './markdown.js'
import { chips, dot, linkResolver, liveBox, machineName, notesFor, providerTag, queuedFor } from './parts.js'
import { recordHref } from './routes.js'
                                       
import { isPinned, state } from './state.js'

const GROUPS                                             = [
  { status: 'waiting', label: 'Waiting on you' },
  { status: 'active', label: 'Active' },
  { status: 'hold', label: 'On hold or blocked' },
  // Neither a hold nor progress is stated, so the home doesn't guess.
  { status: 'unstated', label: 'Status not stated' },
  { status: 'done', label: 'Done' },
]
const NEXT_SHOWN = 6

// A project on both machines shows once, through its record with the newer checkpoint; the row says it has another.
function onePerProject(list           )            {
  const shown = new Set(list.map(p => p.file))
  return list.filter(p => {
    if (!p.pairFile || !shown.has(p.pairFile)) return true
    const other = list.find(o => o.file === p.pairFile)
    return !other || (p.checkedMs ?? -1) > (other.checkedMs ?? -1) || ((p.checkedMs ?? -1) === (other.checkedMs ?? -1) && p.machine === 'desktop')
  })
}

const openDetails = (key        ) => (state.openDetails.has(key) ? ' open' : '')

// Where a quote came from, briefly: the full section title is in its tooltip.
const sourceLabel = (where        ) => (where === 'index row' || where === 'Next' ? where : 'current checkpoint')

// What needs the owner: lines a record states outright ("Waiting on …:") first, then keyword matches, marked as
// possible asks. It covers actions as well as decisions, so it's called "Needs you".
function decisions(all           , now        )         {
  const waiting = all
    .filter(p => p.waits.length > 0)
    .sort((a, b) => Number(b.waits.some(w => w.isStated)) - Number(a.waits.some(w => w.isStated)) || (b.checkedMs ?? -1) - (a.checkedMs ?? -1))
  const help = `<details class="help small"><summary>How this works</summary><p class="muted">Lines a checkpoint states as
    "Waiting on …" come first. Others are matched by wording such as "waits for your decision" or "needs your approval",
    marked "possible", and can miss some. Only current checkpoints, Next lines and index rows are read.</p></details>`
  if (waiting.length === 0) {
    return `<section class="card decisions"><h2 class="home-h">Needs you</h2>
      <p>Nothing found waiting on you in the current checkpoints.</p>${help}</section>`
  }
  const count = waiting.reduce((n, p) => n + p.waits.length, 0)
  return `
    <section class="card decisions accent">
      <h2 class="home-h">Needs you <span class="muted">(${count})</span></h2>
      ${waiting
        .map(
          p => `<div class="decision">
            <div class="decision-head"><a href="${recordHref(p.file)}"><strong>${esc(p.name)}</strong></a> ${providerTag(p)}
              <span class="muted small">${dot(p.machine)} ${machineName(p.machine)}${p.checkedMs !== null ? ` · ${esc(fmtDay(p.checkedMs))}` : ''}</span></div>
            ${p.waits
              .map(
                w => `<blockquote class="quote">${w.isStated ? '' : '<span class="possible">possible</span> '}${esc(w.text)}
                  <span class="muted small" title="${esc(w.where)}">(${esc(sourceLabel(w.where))})</span></blockquote>`,
              )
              .join('')}
          </div>`,
        )
        .join('')}
      ${help}
    </section>`
}

function nextActions(list           , now        )         {
  const withNext = list.filter(p => p.next && p.status !== 'done').sort((a, b) => (b.checkedMs ?? -1) - (a.checkedMs ?? -1))
  if (withNext.length === 0) return ''
  const shown = state.nextMore ? withNext : withNext.slice(0, NEXT_SHOWN)
  return `
    <section class="card next-actions">
      <h2 class="home-h">Next actions</h2>
      <ul class="next-list">
        ${shown
          .map(
            p => `<li><a href="${recordHref(p.file)}"><strong>${esc(p.name)}</strong></a>
              <span class="muted small">${dot(p.machine)} ${p.checkedMs !== null ? esc(ageLabel(p.checkedMs, now, false)) : ''}</span> ${providerTag(p)}
              ${p.isNextCurrent === false ? `<span class="muted small" title="From ${esc(p.nextWhere ?? '')}, which isn't dated as current">· undated</span>` : ''}
              <div class="next-text" title="From ${esc(p.nextWhere ?? 'the record')}">${inline(p.next, linkResolver(p.file))}</div></li>`,
          )
          .join('')}
      </ul>
      ${withNext.length > NEXT_SHOWN ? `<button class="link" data-action="next-more">${state.nextMore ? 'Fewer' : `All ${withNext.length} next actions`}</button>` : ''}
    </section>`
}

export function renderList(data      , width        )         {
  const f = state.filters
  const now = data.now
  const query = f.query.toLowerCase()
  const isMatch = (p         ) =>
    (f.machine === 'all' || p.machine === f.machine) &&
    (query === '' || `${p.name} ${p.state} ${p.next} ${p.waits.map(w => w.text).join(' ')}`.toLowerCase().includes(query))
  const all = [...data.projects].sort(sorter(f.sort))
  const projects = onePerProject(all)
  const shown = onePerProject(all.filter(isMatch))
  // A pin on either record of a paired project pins the project, whichever record the home shows for it.
  const pinned = projects.filter(isPinned)
  const k = kpis(data.projects, data.live, now)
  const chart = activityChart(data.projects, now, Math.max(260, Math.min(720, width - 40)))
  const incomplete = data.projects.filter(p => p.activityComplete === false).length
  const active = data.live.filter(s => s.latestMs !== null && now - s.latestMs < 3 * 24 * 60 * 60 * 1000)

  const row = (p         ) => {
    const isEdited = f.sort === 'edited'
    const ms = isEdited ? p.editedMs : p.checkedMs
    const tone = freshTone(ms === null ? null : isEdited ? dayKeyOf(ms) : ms, now)
    const behind = notesBehind(p, data.live)
    const noteCount = p.file ? notesFor(p.file).length + queuedFor(p.file).length : 0
    const pair = p.pairFile ? data.projects.find(o => o.file === p.pairFile) : undefined
    const href = p.file ? recordHref(p.file) : '#/'
    return `
      <a class="row" href="${href}">
        <span class="age ${tone === 'muted' ? 'muted' : ''}">${dot(tone, ms === null ? '○' : isEdited ? '✎' : '●')} ${esc(ageLabel(ms, now, isEdited))}</span>
        <span class="row-main">
          <span class="row-title">
            <span class="name">${esc(p.name)}</span>
            <span class="chip">${dot(p.machine)} ${machineName(p.machine)}</span>
            ${providerTag(p)}
            ${pair ? `<span class="chip" title="Also has a record on the other machine">⇄ also ${machineName(pair.machine)}${pair.checkedMs !== null ? ` · ${esc(ageLabel(pair.checkedMs, now, false))}` : ''}</span>` : ''}
            ${behind && behind.latestMs !== null ? `<span class="chip">${dot('good', '⚡')} active ${esc(ageLabel(behind.latestMs, now, true))} ago · notes behind</span>` : ''}
            ${noteCount > 0 ? `<span class="chip">✎ ${noteCount} phone note${noteCount === 1 ? '' : 's'}</span>` : ''}
            ${chips(p)}
          </span>
          <span class="state">${esc(p.state)}</span>
        </span>
      </a>`
  }

  const groups = GROUPS.map(g => {
    const rows = shown.filter(p => p.status === g.status)
    if (rows.length === 0) return ''
    const head = `${esc(g.label)} <span class="muted">${rows.length}</span>`
    // Finished projects stay out of the way until asked for (or while filtering).
    return g.status === 'done' && query === ''
      ? `<details class="group" data-key="group-done"${openDetails('group-done')}><summary class="group-h">${head}</summary>${rows.map(row).join('')}</details>`
      : `<section class="group"><h3 class="group-h">${head}</h3>${rows.map(row).join('')}</section>`
  }).join('')

  return `
    ${decisions(all, now)}
    ${nextActions(projects, now)}
    ${pinned.length > 0 ? `<section class="group pinned"><h2 class="home-h">Pinned</h2>${pinned.map(row).join('')}</section>` : ''}

    <h2 class="home-h all">All projects <span class="muted">${projects.length}</span></h2>
    <div class="toolbar">
      <input id="query" type="search" aria-label="Filter projects by name, state or next step" placeholder="Filter…  ( / )" value="${esc(f.query)}" autocomplete="off">
      <div class="segmented">
        ${(['all', 'desktop', 'laptop']         )
          .map(m => `<button data-action="machine" data-value="${m}" class="${f.machine === m ? 'on' : ''}" aria-pressed="${f.machine === m}">${m === 'all' ? 'All' : machineName(m)}</button>`)
          .join('')}
      </div>
      <label class="sort">Sort
        <select id="sort">${SORTS.map(s => `<option value="${s.value}" ${s.value === f.sort ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      </label>
    </div>
    ${shown.length === 0 ? '<p class="muted">No projects match. <button class="link" data-action="clear">Clear filters</button></p>' : groups}

    <details class="activity" data-key="activity"${openDetails('activity')}>
      <summary>Activity: ${k.fresh} checkpoint${k.fresh === 1 ? '' : 's'} in the last 2 days${active.length > 0 ? ` · ${dot('good', '⚡')} ${active.length} live` : ''}</summary>
      <div class="kpis">
        <span>${dot('good')} ${k.fresh} in the last 2 days</span>
        <span>${dot('warning')} ${k.week} this week</span>
        <span>${dot('muted')} ${k.older} older</span>
        ${k.undated > 0 ? `<span>${dot('muted', '○')} ${k.undated} undated</span>` : ''}
        ${k.behind > 0 ? `<span>${dot('good', '⚡')} ${k.behind} with newer local work</span>` : ''}
      </div>
      <section class="card chart">
        <div class="muted">Records updated per day, last 14 days (${chart.total} record${chart.total === 1 ? '' : 's'} in all); hover a day for names${
          incomplete > 0 ? `. History is incomplete here for ${incomplete} record${incomplete === 1 ? '' : 's'} with very many recent changes.` : ''
        }</div>
        ${chart.source}
        <div class="legend"><span>${dot('desktop', '■')} Desktop</span><span>${dot('laptop', '■')} Laptop</span></div>
      </section>
      ${active.map(s => liveBox(s, now, true)).join('')}
    </details>
    ${
      state.mode === 'local'
        ? `<p class="muted small keys">Keys: <kbd>/</kbd> filter · <kbd>r</kbd> refresh · <kbd>b</kbd> back</p>`
        : ''
    }`
}
