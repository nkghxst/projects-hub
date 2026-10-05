// The share panel: what will leave the hub, shown in full before it goes. A section can be explained or asked about;
// a note or idea developed into a first experiment or asked about. Share uses the device's share sheet (pick the Claude
// app there); Copy is always there too. Nothing is run or saved by the hub, and nothing goes into a web address.
import { escapeHtml as esc } from './markdown.js'
import { currentShare } from './actions.js'
import { state } from './state.js'

export function renderSharePanel()         {
  const share = state.share
  if (!share) return ''
  const prompt = currentShare()
  if (!prompt) return ''
  const kinds                     =
    share.target === 'section'
      ? [
          ['explain', 'Explain'],
          ['ask', 'Ask a question'],
        ]
      : [
          ['develop', 'Develop into an experiment'],
          ['ask', 'Ask a question'],
        ]
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return `
    <div class="share-panel card" role="region" aria-label="Share to Claude">
      <div class="share-head"><strong>Share to Claude</strong> <span class="muted small">or any app you pick</span>
        <button type="button" class="link muted" data-action="share-close" aria-label="Close the share panel">✕</button></div>
      <div class="segmented" aria-label="What to ask">
        ${kinds.map(([k, label]) => `<button type="button" data-action="share-kind" data-value="${k}" class="${share.kind === k ? 'on' : ''}" aria-pressed="${share.kind === k}">${label}</button>`).join('')}
      </div>
      ${
        share.kind === 'ask'
          ? `<label class="share-q"><span>Your question</span><input id="share-question" value="${esc(share.question)}" placeholder="For example: what's stopping this?" autocomplete="off"></label>`
          : ''
      }
      <p class="muted small">This exact text leaves the hub for the app you choose${prompt.isCut ? ' (cut to fit, and it says where)' : ''}. Nothing is run or saved here; any answer stays in that app.</p>
      <pre id="share-text" class="share-text" tabindex="0">${esc(prompt.text)}</pre>
      <div class="actions">
        <button type="button" class="primary" data-action="share-send">${canShare ? 'Share…' : 'Copy for Claude'}</button>
        <button type="button" data-action="share-copy">Copy</button>
      </div>
    </div>`
}
