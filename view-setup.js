// First run on the phone: install the app, make a token from GitHub's pre-filled page, then paste it and connect.
import { escapeHtml as esc } from './markdown.js'
import { pageOwner, tokenTemplateUrl } from './source.js'
import { state } from './state.js'

const isLocalPage = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1'

function installStep()         {
  if (state.isInstalled) return '<p>✓ Installed. You can do the rest here.</p>'
  return `
    ${
      state.canInstall
        ? '<p><button class="primary" type="button" data-action="install">Install Projects hub</button></p>'
        : "<p>In Chrome's menu (⋮), choose <strong>Add to Home screen</strong> or <strong>Install app</strong>, then open it from the home screen.</p>"
    }
    <p class="small muted">Optional, but once it's installed, Projects hub also appears in Android's share menu. Setup can carry on here or in the app; both keep the same settings.</p>`
}

export function renderSetup()         {
  const d = state.settingsDraft
  const owner = d.repo.split('/')[0] || pageOwner()
  return `
    <h2 class="title">Set up Projects hub</h2>
    <p>Three steps, a couple of minutes. The app reads your private <code>claude-profile</code> repo with a token that
      stays on this phone and is only ever sent to <code>api.github.com</code>.</p>
    <ol class="steps">
      <li class="card">
        <div class="label strong">1. Install the app</div>
        ${installStep()}
      </li>
      <li class="card">
        <div class="label strong">2. Make a token on GitHub</div>
        <p><a class="button primary" href="${esc(tokenTemplateUrl(owner))}" target="_blank" rel="noopener noreferrer">Open GitHub's token page</a></p>
        <p class="small">It's filled in apart from one choice: under <strong>Repository access</strong>, pick
          <strong>Only select repositories</strong> and choose <code>claude-profile</code>. Then <strong>Generate token</strong>
          and copy it. It's set to last a year; you can change that on the page.</p>
      </li>
      <li class="card">
        <div class="label strong">3. Connect</div>
        <form class="form" id="settings" autocomplete="off">
          <label><span>Repository</span><input id="set-repo" value="${esc(d.repo)}" placeholder="owner/name" autocapitalize="off" spellcheck="false"></label>
          <label><span>Token</span><input id="set-token" type="password" value="${esc(d.token)}" placeholder="github_pat_…" autocapitalize="off" spellcheck="false"></label>
          ${isLocalPage() ? `<details><summary>Advanced (testing on this machine)</summary><label><span>API address</span><input id="set-api" value="${esc(d.apiBase)}" spellcheck="false"></label></details>` : ''}
          <div class="actions">
            <button class="primary" type="button" data-action="paste-connect">Paste token and connect</button>
            <button type="submit">Connect</button>
          </div>
          ${state.settingsMessage ? `<p class="${state.settingsMessage.startsWith('Connected') ? '' : 'error'}">${esc(state.settingsMessage)}</p>` : ''}
        </form>
      </li>
    </ol>`
}
