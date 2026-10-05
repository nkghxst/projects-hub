// The assistant page (desktop): a question about the sources it was opened with (search results, a record, or a note),
// answered once by an isolated run with the desktop's Claude login. The answer names the model that wrote it, links each
// citation to its section, flags citations to sources that weren't sent, lists what was left out, and shows exactly
// what was sent. Nothing is saved. The phone has no assistant: it shares to the Claude app instead.
import { fmtStamp } from './core.js'
                                          
import { escapeHtml as esc, renderMarkdown } from './markdown.js'
import { recordHref } from './routes.js'
import { state } from './state.js'

const isNote = (path        ) => /\/(notes|ideas)\//.test(path)
const sourceHref = (s                              ) => (isNote(s.path) ? '#/inbox' : recordHref(s.path, s.section >= 0 ? s.section : undefined))

// [1], [1, 2] and [1][3] in the answer's text (never in code) become links to their sections; a number that wasn't
// one of the sources is marked.
function withCitations(html        , answer           )         {
  const byNumber = new Map(answer.sources.map(s => [s.n, s]))
  let inCode = 0
  return html
    .split(/(<[^>]+>)/)
    .map((part, i) => {
      if (i % 2 === 1) {
        if (/^<(code|pre)\b/.test(part)) inCode++
        else if (/^<\/(code|pre)>/.test(part)) inCode--
        return part
      }
      if (inCode > 0) return part
      return part.replace(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g, (_m        , list        ) => {
        const links = list.split(',').map(x => {
          const n = Number(x.trim())
          const s = byNumber.get(n)
          return s
            ? `<a class="cite" href="${esc(sourceHref(s))}" title="${esc(`${s.project} — ${s.title}`)}">${n}</a>`
            : `<span class="cite bad" title="Not one of the sources sent">${n}?</span>`
        })
        return `[${links.join(', ')}]`
      })
    })
    .join('')
}

function answerHtml(a           )         {
  const count = a.sources.length
  return `
    <section class="card ai ask-answer" aria-label="Answer">
      <div class="summary-head"><strong class="ai-ink">✦ ${a.kind === 'answer' ? 'Answer' : 'Developed idea'}</strong>
        <span class="muted">written by ${esc(a.model)}, ${esc(fmtStamp(a.atMs, Date.now()))}, from ${count} source${count === 1 ? '' : 's'}; check it against them${a.note ? ` (fallback: ${esc(a.note)})` : ''}</span></div>
      ${a.kind === 'experiment' ? `<p class="muted small">The suggested experiment is Claude's idea, not something your records say.</p>` : ''}
      ${
        a.unknown.length > 0
          ? `<p class="warn">It cites ${a.unknown.map(n => `[${n}]`).join(', ')}, which isn't one of the sources sent: treat that part with care.</p>`
          : ''
      }
      <div class="md">${withCitations(renderMarkdown(a.text, () => null), a)}</div>
      <h3 class="home-h">Sources</h3>
      <ol class="ask-cited">
        ${a.sources
          .map(
            s => `<li value="${s.n}"><a href="${esc(sourceHref(s))}">${esc(s.project ? `${s.project} — ${s.title}` : s.title)}</a>${s.isCut ? ' <span class="muted small">(cut to fit)</span>' : ''}${a.cited.includes(s.n) ? '' : ' <span class="muted small">· not cited</span>'}</li>`,
          )
          .join('')}
      </ol>
      ${a.leftOut.length > 0 ? `<p class="muted small">Left out, over the size limit: ${a.leftOut.map(l => esc(l.title || l.path)).join(' · ')}</p>` : ''}
      <details class="ask-sent"><summary class="muted small">Show exactly what was sent</summary><pre class="share-text" tabindex="0">${esc(a.prompt)}</pre></details>
      <p class="muted small">Not saved anywhere: copy it if you want to keep it.</p>
      <div class="actions"><button type="button" data-action="ask-copy">Copy answer and sources</button></div>
    </section>`
}

export function renderAsk()         {
  const head = (from = '') => `
    <div class="crumbs">
      <button data-action="back" title="Shortcut: b">← Back</button>
      ${from ? `<span class="muted clip">${esc(from)}</span>` : ''}
    </div>
    <h2 class="title">Ask Claude about your records</h2>`
  if (!state.source?.ask) {
    return `${head()}<p class="muted">The assistant runs on the desktop, with its Claude login. On the phone, use ↗ Share on a section or a note to send it to the Claude app.</p>`
  }
  const ask = state.ask
  if (!ask) {
    return `${head()}<p class="muted">Pick what to ask about first: search from the home page and choose “Ask about these”, open a record and choose “Ask about this record”, or choose “Develop” on a note.</p>`
  }
  const on = ask.picks.filter(p => p.isOn).length
  const isRunning = ask.status === 'running'
  return `${head(ask.from)}
    <div class="ask card">
      <div class="segmented" aria-label="What to ask for">
        ${(
          [
            ['answer', 'Answer a question'],
            ['experiment', 'Develop into an experiment'],
          ]         
        )
          .map(([k, label]) => `<button type="button" data-action="ask-kind" data-value="${k}" class="${ask.kind === k ? 'on' : ''}" aria-pressed="${ask.kind === k}">${label}</button>`)
          .join('')}
      </div>
      <label class="share-q"><span>${ask.kind === 'answer' ? 'Your question' : 'Anything in particular? (optional)'}</span>
        <input id="ask-question" value="${esc(ask.question)}" placeholder="${ask.kind === 'answer' ? 'For example: which projects touch the MOTU?' : 'For example: keep it under an evening'}" autocomplete="off" maxlength="500"></label>
      <fieldset class="ask-sources"><legend>Sources: ${on} of ${ask.picks.length} ticked</legend>
        ${ask.picks
          .map(
            (p, i) => `<label class="ask-src"><input type="checkbox" data-action="ask-pick" data-value="${i}"${p.isOn ? ' checked' : ''}${isRunning ? ' disabled' : ''}> <span>${esc(p.label)}</span></label>`,
          )
          .join('')}
      </fieldset>
      <p class="muted small">Runs once on this desktop with your Claude login, isolated: no tools, and only the ticked sections, re-read from your records. Past about 48,000 characters the later sources are left out, and the answer lists them. Nothing is saved.</p>
      <div class="actions">
        <button type="button" class="primary" data-action="ask-run"${isRunning ? ' disabled' : ''}>${isRunning ? 'Writing…' : ask.answer ? 'Ask again' : 'Ask'}</button>
        ${isRunning ? '<span class="muted small" role="status">Writing the answer: this can take a minute.</span>' : ''}
      </div>
      ${ask.error ? `<p class="error" role="alert">${esc(ask.error)}</p>` : ''}
    </div>
    ${ask.answer ? answerHtml(ask.answer) : ''}`
}
