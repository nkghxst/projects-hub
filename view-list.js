// The collection comes first. Needs-you, next actions and original activity/freshness evidence follow it.
import { activityChart, ageLabel, fmtDay, kpis, searchTerms, sorter } from './core.js'
                                                   
import { escapeHtml as esc, inline } from './markdown.js'
import { dot, linkResolver, liveBox, machineName, onePerProject, projectName, providerTag } from './parts.js'
import { recordHref } from './routes.js'
                                       
import { changedRecords } from './view-changes.js'
import { state } from './state.js'
import { snapshotOverview } from './view-snapshot.js'
import { collectionLayout, renderCollection, collectionProjects, projectAsks } from './collection-ui.js'

const NEXT_SHOWN = 6

const openDetails = (key        ) => (state.openDetails.has(key) ? ' open' : '')

// What needs the owner: lines a record states outright ("Waiting on …:") first, then keyword matches, marked as
// possible asks. It covers actions as well as decisions, so it's called "Needs you".
function decisions(data      , now        )         {
  const all = data.projects
  const waiting = collectionProjects(data)
    .filter(p => projectAsks(p,data).length > 0)
    .sort((a, b) => Number(b.waits.some(w => w.isStated)) - Number(a.waits.some(w => w.isStated)) || (b.checkedMs ?? -1) - (a.checkedMs ?? -1))
  const help = `<details class="help small"><summary>How this works</summary><p class="muted">Lines a checkpoint states as
    "Waiting on …" come first. Others are matched by wording such as "waits for your decision" or "needs your approval",
    marked "possible", and can miss some. Only current checkpoints, Next lines and index rows are read.</p></details>`
  if (waiting.length === 0) {
    return `<details class="card fold decisions" data-fold="needs-you"${foldOpen('needs-you')}>
      <summary><h2 class="home-h">Needs you</h2></summary>
      <p>Nothing found waiting on you in the current checkpoints.</p>${help}</details>`
  }
  const count = waiting.reduce((n, p) => n + projectAsks(p,data).length, 0)
  return `
    <details class="card fold decisions accent" data-fold="needs-you"${foldOpen('needs-you')}>
      <summary><h2 class="home-h">Needs you <span class="muted">(${count})</span></h2></summary>
      ${waiting
        .map(
          p => `<div class="decision">
            <div class="decision-head"><a href="${recordHref(p.file)}"><strong>${esc(p.name)}</strong></a> ${providerTag(p)}
              <span class="muted small">${dot(p.machine)} ${machineName(p.machine)}${p.checkedMs !== null ? ` · ${esc(fmtDay(p.checkedMs))}` : ''}</span></div>
            ${projectAsks(p,data)
              .map(
                w => `<blockquote class="quote">${w.isStated ? '' : '<span class="possible">possible</span> '}${esc(w.text)}
                  <span class="muted small" title="${esc(w.sources.join('; '))}">(${w.sources.map(s => esc(s)).join('<br>')})</span></blockquote>`,
              )
              .join('')}
          </div>`,
        )
        .join('')}
      ${help}
    </details>`
}

// A way into the catch-up page when anything changed since this device last looked.
function catchUp()         {
  const n = changedRecords().length
  return n === 0 ? '' : `<a class="changes-banner" href="#/changes">${n} record${n === 1 ? '' : 's'} changed since you last looked · Catch up →</a>`
}

function nextActions(list           , now        )         {
  const withNext = list.filter(p => p.next && p.status !== 'done').sort((a, b) => (b.checkedMs ?? -1) - (a.checkedMs ?? -1))
  if (withNext.length === 0) return ''
  const shown = state.nextMore ? withNext : withNext.slice(0, NEXT_SHOWN)
  return `
    <details class="card fold next-actions" data-fold="next-actions"${foldOpen('next-actions')}>
      <summary><h2 class="home-h">Next actions <span class="muted">(${withNext.length})</span></h2></summary>
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
    </details>`
}

// Home sections that start open and fold on click; a fold is remembered on this device (state.folded).
const foldOpen = (key        ) => (state.folded.has(key) ? '' : ' open')

// When each device last published a change to the profile: its newest commit on GitHub (on the desktop, as of this
// clone's last sync). A sync with nothing new leaves no trace, hence "change published", not "synced". Commits made
// here but not yet pushed are named, so they aren't mistaken for published ones.
function freshness(published                   , now        )         {
  if (!published) return ''
  if (published.isUnknown) {
    return `<p class="freshness muted small">Last change published: unknown (git couldn't be read on this computer)</p>`
  }
  const part = (label        , tone                                , ms               ) =>
    ms === null ? '' : `<span>${dot(tone)} ${label} ${esc(ageLabel(ms, now, true))} ago</span>`
  const parts = [part('Desktop', 'desktop', published.desktop), part('Laptop', 'laptop', published.laptop), part('Phone', 'muted', published.phone)].filter(Boolean)
  const pending = published.unpublished
    ? `<span class="warning-text">${published.unpublished} change${published.unpublished === 1 ? '' : 's'} on this computer not yet published</span>`
    : ''
  if (parts.length === 0 && !pending) return ''
  const fetched = typeof published.fetchedAtMs === 'number' ? `<span>checked GitHub ${esc(ageLabel(published.fetchedAtMs, now, true))} ago</span>` : ''
  const where = state.mode === 'local' ? "GitHub's copy as of this computer's last sync" : 'GitHub'
  return `<p class="freshness muted small" title="The newest commit from each device on ${where}. A sync with nothing new to publish doesn't show here.">Last change published: ${[...parts, pending, fetched].filter(Boolean).join(' · ')}</p>`
}

// A search result: project, section, and an excerpt with the matched words highlighted (escaped first).
function hitHtml(h           , now        )         {
  let html = ''
  let at = 0
  for (const [a, b] of h.marks) {
    html += `${esc(h.snippet.slice(at, a))}<mark>${esc(h.snippet.slice(a, b))}</mark>`
    at = b
  }
  html += esc(h.snippet.slice(at))
  return `<a class="hit" href="${recordHref(h.path, h.section)}">
      <span class="hit-head"><strong>${esc(projectName(h.path))}</strong>
        <span class="muted small">${esc(h.sectionTitle)}${h.dateMs !== null ? ` · ${esc(ageLabel(h.dateMs, now, false))}` : ''}</span></span>
      <span class="snippet">${html}</span></a>`
}

function searchResults(query        , now        )         {
  if (query.trim().length < 2) return ''
  // Results follow the machine filter, like the project list.
  const machine = state.filters.machine
  const all = state.searchFor === query.trim() ? state.searchHits : null
  const hits = all && machine !== 'all' ? all.filter(h => h.path.startsWith(`memory/${machine}/`)) : all
  // Said outright, so a hit that doesn't contain the typed word isn't a puzzle (I6).
  const extra = searchTerms(query.trim(), state.data?.aliases ?? []).flatMap(names => names.slice(1))
  return `
    <section class="card search-hits">
      <h2 class="home-h">In record text ${hits ? `<span class="muted">${hits.length === 30 ? '30+' : hits.length}</span>` : ''}
        ${state.source?.ask && hits && hits.length > 0 ? '<button type="button" class="link ask-link" data-action="ask-search" title="Ask Claude on this desktop, citing these sections">✦ Ask about these</button>' : ''}</h2>
      ${extra.length > 0 ? `<p class="muted small">Also searched for ${extra.map(n => `<strong>${esc(n)}</strong>`).join(', ')} (aliases in the glossary)</p>` : ''}
      ${hits === null ? '<p class="muted">Searching…</p>' : hits.length === 0 ? '<p class="muted">No sections contain all of those words.</p>' : hits.map(h => hitHtml(h, now)).join('')}
    </section>`
}

export function renderList(data      , width        )         {
  collectionLayout()
  const f = state.filters
  const now = data.now
  const all = [...data.projects].sort(sorter(f.sort))
  const projects = onePerProject(all)
  const k = kpis(data.projects, data.live, now)
  const chart = activityChart(data.projects, now, Math.max(260, Math.min(720, width - 40)))
  const incomplete = data.projects.filter(p => p.activityComplete === false).length
  const active = data.live.filter(s => s.latestMs !== null && now - s.latestMs < 3 * 24 * 60 * 60 * 1000)

  return `
    ${renderCollection(data)}
    ${f.query.trim().length >= 2 ? searchResults(f.query, now) : `${catchUp()}${decisions(data, now)}${nextActions(projects, now)}`}
    <section class="collection-provenance" aria-label="Source freshness">${freshness(data.published, now)}${snapshotOverview(data.sharedProjects)}</section>

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
        ? `<p class="muted small keys">Keys: <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> search · <kbd>r</kbd> refresh · <kbd>b</kbd> back</p>`
        : ''
    }`
}
