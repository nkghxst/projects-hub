// The share panel: what will leave the hub, shown in full before it goes. A section can be explained or asked about;
// a note or idea developed into a first experiment or asked about. Share uses the device's share sheet (pick the Claude
// app there); Copy is always there too. Nothing is run or saved by the hub, and nothing goes into a web address.
import { escapeHtml as esc } from './markdown.js'
import { currentShare } from './actions.js'
import { state } from './state.js'

// The exact text, escaped, with the part quoted from the record (between the triple quotes) set apart from the
// instructions around it; read as text, it's still exactly what's sent (Codex M5 review: at phone width the
// instructions filled the preview).
export function shareTextHtml(text        )         {
  const start = text.indexOf('"""\n')
  const end = text.lastIndexOf('\n"""')
  if (start === -1 || end <= start) return esc(text)
  return `${esc(text.slice(0, start + 4))}<span class="quoted">${esc(text.slice(start + 4, end))}</span>${esc(text.slice(end))}`
}

// What's being sent and how much: "Sending “Current checkpoint” from Saltglass · 1,234 characters".
export function shareSummary(prompt                                  )         {
  const share = state.share
  const record = share?.target === 'section' ? state.record : null
  const section = record?.sections[share?.index ?? -1]
  const project = record ? (state.data?.projects.find(p => p.file === record.path)?.name ?? record.title) : ''
  const note = share?.target === 'note' ? state.notes.find(n => n.path === share.note) : undefined
  const what = section ? `“${section.title}” from ${project}` : note ? `the ${note.kind} “${note.title}”` : 'this text'
  return `Sending ${what} · ${prompt.text.length.toLocaleString('en-GB')} characters${prompt.isCut ? ', cut to fit' : ''}`
}

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
      <p class="muted small">This exact text leaves the hub for the app you choose${prompt.isCut ? ' (cut to fit, and it says where)' : ''}. Nothing is run or saved here; any answer stays in that app.${
        share.kind === 'explain'
          ? ' Explain keeps the app to this text alone.'
          : " It includes the project's brief and the GitHub repositories its record mentions, and invites the app to look things up with its own tools (a GitHub connector, say), labelling what came from your notes and what it found."
      }</p>
      <p id="share-size" class="small share-size">${esc(shareSummary(prompt))}</p>
      <pre id="share-text" class="share-text" tabindex="0">${shareTextHtml(prompt.text)}</pre>
      <div class="actions">
        <button type="button" class="primary" data-action="share-send">${canShare ? 'Share…' : 'Copy for Claude'}</button>
        <button type="button" data-action="share-copy">Copy</button>
      </div>
    </div>`
}
