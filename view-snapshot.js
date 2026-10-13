                                                                          
import { escapeHtml as esc } from './markdown.js'
import { recordHref } from './routes.js'
import { state } from './state.js'

const stamp = (ms               ) => ms === null ? 'unknown' : new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
const names = { active: 'active', waiting: 'waiting', hold: 'on hold', done: 'done', unstated: 'not stated' }
const age = (ms        , now        ) => {
  if (ms > now) return 'future date'
  const days = Math.floor((now - ms) / 86400000)
  return days === 0 ? 'less than a day old' : `${days} ${days === 1 ? 'day' : 'days'} old`
}
function evidenceHtml(evidence                 , now        )         {
  const refs = { 'atlas-parent': 'Parent repository', 'atlas-site': 'Site repository', 'atlas-coordinator': 'Coordinator log' }
  return `<details><summary>Recorded local observations</summary>${evidence.map(e => {
    const freshness = e.updatedAt === null ? 'unknown' : e.observedAt > now + 300000 || e.updatedAt > e.observedAt + 300000 ? 'unknown (clock discrepancy)' : now - e.observedAt > 2 * 86400000 || now - e.updatedAt >= 7 * 86400000 ? 'stale' : 'current'
    return `<p class="small"><strong>${refs[e.ref]}</strong> · ${freshness}<br>${e.ref === 'atlas-coordinator' ? 'Latest log entry' : 'Latest commit'} ${stamp(e.updatedAt)}<br>Observed ${stamp(e.observedAt)} on desktop${e.ref === 'atlas-coordinator' ? '' : `<br>HEAD ${e.head ?? 'unknown'} · working tree ${e.dirty === null ? 'unknown' : e.dirty ? 'has changes' : 'clean'}`}</p>`
  }).join('')}<p class="muted small">Recorded on the owning machine; not a live connection. Git and log activity do not establish completion. Inspect the project record for these source locations.</p></details>`
}
export function snapshotChip(shared                            , path        )         {
  const p = shared?.projects.find(p => p.records.includes(path))
  return p ? `<span class="chip" title="${esc(p.reason)}">Owner: ${esc(p.owner ?? 'unknown')} · Observation ${p.observationFreshness}</span>` : ''
}
export function snapshotOverview(shared                 )         {
  if (!shared) return ''
  return `<details class="card" data-key="shared-snapshots"${state.openDetails.has('shared-snapshots') ? ' open' : ''}><summary>Shared observations</summary>
    <p class="muted small">Checkpoint evidence, not proof of runtime activity. Recent means a matching observation within 2 days; the checkpoint date is shown separately. Inactivity is never inferred from missing updates.</p>
    ${shared.machines.map(m => `<p class="small">${esc(m.machine)}: ${m.status} · observed ${stamp(m.observedAt)}</p>`).join('')}
    ${shared.orphaned ? `<p class="small">${shared.orphaned} snapshot entries have no indexed project here; they are not restored. Check deletion or delayed sync.</p>` : ''}
  </details>`
}
export function snapshotDetails(shared                            , path        , now = Date.now())         {
  const p = shared?.projects.find(p => p.records.includes(path))
  if (!p) return ''
  const o = p.observation
  return `<section class="card snapshot" aria-label="Shared observation">
    <strong>Shared observation · ${p.observationFreshness}</strong>
    <p class="small">Owner: ${esc(p.owner ?? 'unknown')} · Project ID: <code>${esc(p.id)}</code></p>
    <p>${esc(p.reason)}</p>
    ${o ? `<dl class="brief-rows"><dt>Recorded state</dt><dd>${esc(names[o.state])}${p.observationFreshness === 'unknown' ? ' (unconfirmed)' : ''}</dd>
      <dt>Needs you</dt><dd>${o.needsYou ? 'Stated in source at observation — inspect the current checkpoint below' : 'No stated wait found in that observation'}${p.observationFreshness === 'unknown' ? ' (unconfirmed)' : ''}</dd>
      <dt>Checkpoint date</dt><dd>${o.sourceUpdatedAt === null ? 'unknown' : stamp(o.sourceUpdatedAt).slice(0, 10) + ` · ${age(o.sourceUpdatedAt, now)}`}</dd>
      <dt>Observed</dt><dd>${stamp(o.observedAt)} by ${esc(o.owner)} · ${age(o.observedAt, now)}</dd>
      <dt>Source</dt><dd><a href="${recordHref(o.source.path)}">Inspect Markdown record</a> · <code>${esc(o.source.fingerprint)}</code></dd></dl>` : ''}
    ${o?.evidence ? evidenceHtml(o.evidence, now) : ''}
    <p class="muted small">Agent session/process activity is not included. Refreshing old Markdown does not make its checkpoint newer.</p>
  </section>`
}
