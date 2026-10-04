// Small pieces several views share: marks, names, links, flag chips, the live-work box and note cards.
import { ageLabel, boldVerdicts, FLAGS, fmtStamp, HEX, resolvePath } from './core.js'
                                                                   
import { escapeHtml as esc, inline, renderMarkdown } from './markdown.js'
                                                 
import { recordHref } from './routes.js'
import { state } from './state.js'
                                        

export const dot = (tone      , glyph = '●') => `<span class="mark" style="color:${HEX[tone]}">${glyph}</span>`
export const machineName = (m         ) => (m === 'desktop' ? 'Desktop' : 'Laptop')
export const projectName = (file        ) =>
  state.data?.projects.find(p => p.file === file)?.name ?? file.split('/').pop()?.replace(/\.md$/, '') ?? file
export const notesFor = (file        ) => state.notes.filter(n => n.project === file)
export const queuedFor = (file        ) => state.queue.filter(q => q.project === file)

// Only http(s) addresses become links; anything else (javascript:, data:, file:) is shown as text.
export const isWebUrl = (url        ) => /^https?:\/\/[^\s"<>]+$/i.test(url.trim())

export function linkResolver(docPath        )               {
  const dir = docPath.split('/').slice(0, -1).join('/')
  return href => {
    if (isWebUrl(href)) return { href, isInternal: false }
    if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return null
    const target = resolvePath(dir, href.split('#')[0])
    return target && target.endsWith('.md') ? { href: recordHref(target), isInternal: true } : null
  }
}

export function chips(p         )         {
  return FLAGS.filter(x => p.flags.includes(x.flag))
    .map(x => `<span class="chip">${dot(x.tone, x.icon)} ${esc(x.label)}</span>`)
    .join('')
}

export function liveBox(source      , now        , isCompact         )         {
  const entries = source.entries.slice(0, state.liveMore ? source.entries.length : 4)
  const trees = source.worktrees.slice(0, isCompact ? 2 : 6)
  const latest = source.entries[0]
  const resolve = linkResolver('')
  return `
    <section class="card live">
      <div class="live-head">
        ${dot('good', '⚡')} <strong>${esc(source.label)}</strong>
        ${source.latestMs !== null ? `<span class="muted">last activity ${esc(fmtStamp(source.latestMs, now))} (${esc(ageLabel(source.latestMs, now, true))} ago)</span>` : ''}
      </div>
      ${isCompact && latest ? `<div class="clip muted">${esc(latest.text.replace(/\*\*|`/g, ''))}</div>` : ''}
      ${
        isCompact
          ? ''
          : `<div class="log">${entries
              .map(x => `<div class="log-entry"><span class="when">${esc(fmtStamp(x.atMs, now))}</span> ${inline(boldVerdicts(x.text), resolve)}</div>`)
              .join('')}</div>`
      }
      ${trees
        .map(
          w => `<div class="tree"><span class="muted">⎇</span> <span>${esc(w.branch || w.name)}</span>
            <span class="clip muted">${w.lastCommitMs !== null ? `${esc(fmtStamp(w.lastCommitMs, now))} · ` : ''}${esc(w.subject)}${w.changed > 0 ? ` · ${w.changed} uncommitted` : ''}</span></div>`,
        )
        .join('')}
      ${
        !isCompact && source.memoryFiles.length > 0
          ? `<div class="memory"><span class="muted">Coordinator memory:</span> ${source.memoryFiles
              .map(m => `<a href="${recordHref(m.path)}">${esc(m.path.split('/').pop() ?? m.path)}</a> <span class="muted">(${esc(fmtStamp(m.mtimeMs, now))})</span>`)
              .join(' · ')}</div>`
          : ''
      }
      <div class="actions">
        ${
          isCompact
            ? `<a class="link" href="${recordHref(source.records[0])}">Open record →</a>`
            : `<button class="link" data-action="live-more">${state.liveMore ? 'Fewer log entries' : `All ${source.entries.length} recent log entries`}</button>
               <button class="link" data-action="copy" data-text="${esc(source.logPath)}">Copy log path</button>`
        }
      </div>
    </section>`
}

export function noteCard(n               , isQueued         )         {
  const resolve = linkResolver(n.path)
  const project = n.project ? `<a href="${recordHref(n.project)}">${esc(projectName(n.project))}</a>` : ''
  const captured = 'captured' in n ? n.captured : fmtStamp(n.createdAt, Date.now())
  const sourceUrl = 'source' in n ? n.source : ''
  const source = !sourceUrl
    ? ''
    : isWebUrl(sourceUrl)
      ? `<div class="clip"><a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(sourceUrl)}</a></div>`
      : `<div class="clip muted">${esc(sourceUrl)}</div>`
  return `
    <article class="card note ${isQueued ? 'queued' : ''}">
      <div class="note-head">
        <span class="mark" title="${n.kind === 'idea' ? 'Idea' : 'Note'}">${n.kind === 'idea' ? '◇' : '✎'}</span>
        <strong>${esc(n.title)}</strong>
        <span class="muted">${esc(captured)}${project ? ' · ' : ''}${project}${isQueued ? ' · waiting to send' : ''}</span>
        ${!isQueued && state.mode === 'local' ? `<a class="link muted" href="${recordHref(n.path)}">file</a>` : ''}
      </div>
      <div class="md">${renderMarkdown(n.body, resolve)}</div>
      ${source}
    </article>`
}
