import { readReceipts, receiptLabel } from './capture-receipts.js'
// The inbox, the capture form and the phone's settings.
import { MACHINES } from './core.js'
import { escapeHtml as esc } from './markdown.js'
import { machineName, noteCard, projectName } from './parts.js'
import { captureHref } from './routes.js'
import { effectiveDraft, quickAddBox } from './quick-add.js'
import { pageOwner, tokenTemplateUrl } from './source.js'
import { deviceName, state, UNKNOWN_DEST } from './state.js'
import { collectionProjects, projectMembers } from './collection-ui.js'
import { projectKey } from './collection.js'
import { repoSettingsMarkup } from './repo-reader-ui.js'

const isLocalPage = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1'

export function renderInbox()         {
  const kind = state.inboxKind
  const status = state.inboxState
  const projects = state.data ? collectionProjects(state.data).filter(p => p.file) : []
  const selected = projects.find(p => projectKey(p, state.data?.sharedProjects) === state.inboxProject)
  const members = new Set(selected ? projectMembers(selected).map(p => p.file) : [])
  const notes = state.notes
    .filter(n => kind === 'all' || n.kind === kind)
    .filter(n => !state.inboxProject || members.has(n.project))
    .filter(n => !state.inboxPictures || Boolean(n.attachments?.length))
    .filter(n => status === 'all' || (status === 'handled' ? Boolean(n.handledAtMs) : !n.handledAtMs))
  const queued = state.queue.filter(q => kind === 'all' || q.kind === kind)
  const dest = state.source?.dest
  // Waiting notes, split by what's stopping them: nothing (they'll send), a conflict, or another repository.
  const sending = queued.filter(q => q.dest === dest && !q.conflict)
  const conflicts = queued.filter(q => q.dest === dest && q.conflict)
  const unplaced = queued.filter(q => q.dest === UNKNOWN_DEST)
  const held = queued.filter(q => q.dest !== dest && q.dest !== UNKNOWN_DEST)
  const canCapture = Boolean(state.source?.createFile)
  return `
    <div class="crumbs"><a class="button" href="#/">← All projects</a>${canCapture ? `<a class="button primary" href="${captureHref()}">✎ New note</a>` : ''}</div>
    <h2 class="title">Notes & testing</h2>
    <p class="muted">${
      state.mode === 'local'
        ? 'Notes and ideas from your devices, as of this clone’s last profile sync.'
        : 'Notes and ideas from your devices, stored in claude-profile (memory/phone/ and memory/desktop/).'
    }</p>
    ${state.notesCached ? `<p class="notice" role="status">Saved copy of notes${state.notesLoadedAt ? ` from ${esc(new Date(state.notesLoadedAt).toLocaleString())}` : ' · date unavailable'}. Reconnect and refresh for current notes.</p>` : ''}
    <div class="toolbar notes-toolbar"><label>Project<select id="inbox-project"><option value="">All projects</option>${projects.map(p=>{const key=projectKey(p,state.data?.sharedProjects);return `<option value="${esc(key)}" ${state.inboxProject===key?'selected':''}>${esc(p.name)}</option>`}).join('')}</select></label><button data-action="inbox-pictures" aria-pressed="${state.inboxPictures}" class="${state.inboxPictures?'on':''}">Pictures only</button></div>
    <div class="toolbar">
      <div class="segmented" aria-label="Show">
        ${(['new', 'handled', 'all']         )
          .map(k => `<button data-action="inbox-state" data-value="${k}" class="${status === k ? 'on' : ''}" aria-pressed="${status === k}">${k === 'new' ? 'Open' : k === 'handled' ? 'Handled' : 'Everything'}</button>`)
          .join('')}
      </div>
      <div class="segmented" aria-label="Kind">
        ${(['all', 'note', 'idea']         )
          .map(k => `<button data-action="inbox-kind" data-value="${k}" class="${kind === k ? 'on' : ''}" aria-pressed="${kind === k}">${k === 'all' ? 'All' : k === 'note' ? 'Notes' : 'Ideas'}</button>`)
          .join('')}
      </div>
    </div>
    ${
      sending.length > 0
        ? `<section class="queue"><div class="label">Saved on ${deviceName()}, waiting to send (${sending.length})${state.queueError ? `: ${esc(state.queueError)}` : ''}
            <button class="link" data-action="retry">Retry now</button></div>${sending.map(q => noteCard(q, true)).join('')}</section>`
        : ''
    }
    ${
      conflicts.length > 0
        ? `<section class="queue"><div class="label">Not sent: a different file is already at the note's path (${conflicts.length})</div>
            ${conflicts.map(q => noteCard(q, true, 'conflict')).join('')}</section>`
        : ''
    }
    ${
      unplaced.length > 0
        ? `<section class="queue"><div class="label">Held: saved by an earlier version of the app, which didn't record which repository they were for (${unplaced.length}). Choose where each goes, or copy or discard it.</div>
            ${unplaced.map(q => noteCard(q, true, 'unknown-repo')).join('')}</section>`
        : ''
    }
    ${
      held.length > 0
        ? `<section class="queue"><div class="label">Held: written for a different repository than the one in Settings (${held.length})</div>
            ${held.map(q => noteCard(q, true, 'other-repo')).join('')}</section>`
        : ''
    }
    <div class="notes-gallery">${notes.map(n => noteCard(n, false)).join('')}</div>
    ${notes.length===0 ? (state.notes.length ? '<p class="muted">No notes match these filters. Try Everything, All projects or turn off Pictures only.</p>' : queued.length===0 ? emptyInbox(canCapture) : '') : ''}
    ${state.receiptWarning?`<p class="error" role="alert">${esc(state.receiptWarning)}</p>`:''}
    <details class="capture-receipts"><summary>Capture receipts on this device</summary><p class="muted small">Recent actual saves for this destination. A desktop receipt cannot confirm publication.</p>${readReceipts(dest??'').map(r=>`<article><strong>${esc(r.title)}</strong><p>${esc(receiptLabel(r.status))}</p><small>${esc(new Date(r.at).toLocaleString())}</small></article>`).join('')||'<p>No capture receipts saved here yet.</p>'}</details>`
}

// What to do when there's nothing yet: on the desktop, how notes arrive; on the phone, a way to start one.
function emptyInbox(canCapture         )         {
  if (state.mode === 'local') {
    return `<p class="muted">Nothing here. Use ✎ Note to capture one on this computer; notes from the phone show here
      once this machine's next profile sync has pulled them (sessions sync when they start and end).</p>`
  }
  return canCapture
    ? `<p class="muted">Nothing here yet.</p><p><a class="button primary" href="${captureHref()}" data-action="new-idea">✎ Capture an idea</a></p>`
    : '<p class="muted">Nothing here yet. Connect in <a href="#/settings">Settings</a> to capture notes and ideas.</p>'
}

import { capturePictures } from './photo-ui.js'
export function renderCapture()         {
  const d = state.draft
  // A quick-add token's kind and project show in the form as well as in its chip (I9).
  const { kind, project, q } = effectiveDraft(d)
  const projects = state.data?.projects.filter(p => p.file) ?? []
  // The project this note was started from is always offered, even before the list has loaded; otherwise the
  // required picker would be empty and the browser would refuse to save.
  const isProjectMissing = project !== '' && !projects.some(p => p.file === project)
  const extraOptions =
    (isProjectMissing ? `<option value="${esc(project)}" selected>${esc(projectName(project))}</option>` : '') +
    (state.data ? '' : '<option value="" disabled>Loading projects…</option>')
  return `
    <div class="crumbs"><button data-action="back">← Back</button></div>
    <h2 class="title">New ${kind === 'idea' ? 'idea' : 'note'}</h2>
    <div class="segmented">
      <button data-action="draft-kind" data-value="note" class="${kind === 'note' ? 'on' : ''}" aria-pressed="${kind === 'note'}">Note on a project</button>
      <button data-action="draft-kind" data-value="idea" class="${kind === 'idea' ? 'on' : ''}" aria-pressed="${kind === 'idea'}">Idea</button>
    </div>
    <form class="form" id="capture" autocomplete="off">
      <fieldset class="capture-fields"${state.savingDraft ? ' disabled' : ''}>
      ${
        kind === 'note'
          ? `<label><span>Project</span>
              <select id="draft-project" required>
                <option value="">Choose a project…</option>
                ${extraOptions}
                ${MACHINES.map(
                  m => `<optgroup label="${machineName(m)}">${projects
                    .filter(p => p.machine === m)
                    .map(p => `<option value="${esc(p.file)}" ${p.file === project ? 'selected' : ''}>${esc(p.name)}</option>`)
                    .join('')}</optgroup>`,
                ).join('')}
              </select></label>`
          : ''
      }
      <label><span>${kind === 'idea' ? 'Idea' : 'Note'} <span class="muted">(or just a link)</span></span><textarea id="draft-body" rows="5">${esc(d.body)}</textarea></label>
      ${quickAddBox(q, d.body.trim() === '')}
      <label><span>Link <span class="muted">(optional)</span></span><input id="draft-source" type="url" value="${esc(d.source)}" placeholder="https://…"></label>
      <label><span>Title <span class="muted">(optional)</span></span><input id="draft-title" value="${esc(d.title)}" maxlength="120"></label>
      ${capturePictures()}
      ${state.data?.canWrite === false ? `<p class="error" role="alert">This computer can't save notes here. ${esc(state.data.writeRefusal ?? '')}</p>` : ''}
      <div class="actions sticky">
        <button class="primary" type="submit"${state.data?.canWrite === false ? ' disabled' : ''}>Save</button>
        <button type="button" data-action="clear-draft">Clear</button>
      </div>
      <p class="muted small">${
        state.mode === 'local'
          ? "Saved to this computer's claude-profile clone (memory/desktop/); the next profile sync publishes it, so the phone sees it after that."
          : "Saved on this phone straight away, then sent to claude-profile (memory/phone/) when there's a connection."
      } Don't put passwords or tokens in notes.</p>
      </fieldset>
    </form>`
}

// Settings for how this device shows things (both apps).
function displaySettings()         {
  return `
    <section class="card form">
      <h3 class="home-h">On this device</h3>
      <label><span>Flag an Active project when its newest checkpoint is at least this many days old (0 for never)</span>
        <input id="set-stale" type="number" min="0" max="365" inputmode="numeric" value="${state.staleDays}"></label>
    </section>`
}

export function renderSettings()         {
  if (state.mode === 'local') {
    return `<h2 class="title">Settings</h2><p>The desktop app reads your local claude-profile clone without a profile connection.</p>${displaySettings()}${repoSettingsMarkup()}<section class="card"><p>Remove all local Hub data, including repository mappings, tokens and saved private documents.</p><button type="button" class="link danger" data-action="remove-all">Remove all hub data from this device…</button></section><p><a href="#/">← All projects</a></p>`
  }
  // What's being typed survives redraws; it only replaces the saved settings on Save.
  const d = state.settingsDraft
  return `
    <h2 class="title">Settings</h2>
    <p>This app reads your private <code>claude-profile</code> repo from GitHub with a fine-grained token that stays on this phone and is only ever sent to <code>api.github.com</code>.</p>
    <form class="form" id="settings" autocomplete="off">
      <label><span>Repository</span><input id="set-repo" value="${esc(d.repo)}" placeholder="owner/name" autocapitalize="off" spellcheck="false"></label>
      <label><span>Token</span><input id="set-token" type="password" value="${esc(d.token)}" placeholder="github_pat_…" autocapitalize="off" spellcheck="false"></label>
      ${isLocalPage() ? `<details><summary>Advanced (testing on this machine)</summary><label><span>API address</span><input id="set-api" value="${esc(d.apiBase)}" spellcheck="false"></label></details>` : ''}
      <div class="actions">
        <button class="primary" type="submit">Save and connect</button>
        ${d.token ? '<button type="button" data-action="forget-token">Forget token</button>' : ''}
      </div>
      ${state.settingsMessage ? `<p class="${state.settingsMessage.startsWith('Connected') || state.settingsMessage.startsWith('Offline') ? '' : 'error'}">${esc(state.settingsMessage)}</p>` : ''}
    </form>
    <section class="card">
      <div class="label strong">A new token</div>
      <p>When the token expires or you replace it: <a href="${esc(tokenTemplateUrl(d.repo.split('/')[0] || pageOwner()))}" target="_blank" rel="noopener noreferrer">open GitHub's pre-filled token page</a>,
      pick <strong>Only select repositories</strong> → <code>claude-profile</code>, generate it, then paste it above.
      Revoke the old one on GitHub (Settings → Developer settings → Fine-grained tokens), and revoke this one there if the phone is lost.</p>
    </section>
    ${repoSettingsMarkup()}
    <section class="card">
      <div class="label strong">This device</div>
      <p class="small">Forget token keeps saved notes and the offline copy. This removes everything the app keeps here: token, settings, offline copies and unsent notes.</p>
      <button type="button" class="link danger" data-action="remove-all">Remove all hub data from this device…</button>
    </section>`
}
