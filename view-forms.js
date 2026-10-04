// The inbox, the capture form and the phone's settings.
import { MACHINES } from './core.js'
import { escapeHtml as esc } from './markdown.js'
import { machineName, noteCard, projectName } from './parts.js'
import { captureHref } from './routes.js'
import { settings, state } from './state.js'

export function renderInbox()         {
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

export function renderCapture()         {
  const d = state.draft
  const projects = state.data?.projects.filter(p => p.file) ?? []
  // The project this note was started from is always offered, even before the list has loaded; otherwise the
  // required picker would be empty and the browser would refuse to save.
  const isProjectMissing = d.project !== '' && !projects.some(p => p.file === d.project)
  const extraOptions =
    (isProjectMissing ? `<option value="${esc(d.project)}" selected>${esc(projectName(d.project))}</option>` : '') +
    (state.data ? '' : '<option value="" disabled>Loading projects…</option>')
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
                ${extraOptions}
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

export function renderSettings()         {
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
