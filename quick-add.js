// I9 quick-add tokens (from Todoist), for the capture form: `#saltglass` files a note under that project and `idea:` or
// `note:` at the very start picks the kind, so a phone capture needs no dropdown. Only exact matches count (Codex M6
// review): a record's file name (`#saltglass`) or the project's name as one hyphenated word (`#studio-hud`). A record
// on both machines resolves like the home list (the newer checkpoint) and the chip names which. Anything else stays as
// text: ordinary hashtags, partial names, a name two different records share, two projects at once, or a project with
// `idea:`; the last three say why. The text keeps its tokens until Save, and ✕ on a chip (or choosing a project or
// kind by hand) keeps that token as text.
                                                  
import { escapeHtml as esc } from './markdown.js'
import { onePerProject } from './parts.js'
import { state } from './state.js'
                                       

                                                                                      
                        
                                                
                                                                                                      
                                                                                                                   
                                             
                 
 

const KIND = /^\s*(idea|note):(?=\s|$)/i
const TAG = /(^|\s)#([a-z0-9][a-z0-9-]*)(?=\s|$)/gi
const slug = (s        ) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const stem = (file        ) => (file.split('/').pop() ?? '').replace(/\.md$/i, '').toLowerCase()

export function parseQuickAdd(body        , projects             , keep          )           {
  const kept = new Set(keep.map(k => k.toLowerCase()))
  const notes           = []
  const word = body.match(KIND)?.[1]?.toLowerCase()
  const kind = word && !kept.has(`${word}:`) ? { token: `${word}:`, kind: word             } : null

  const found = new Map                   ()
  const seen = new Set        ()
  for (const m of body.matchAll(TAG)) {
    const name = m[2].toLowerCase()
    const token = `#${name}`
    if (kept.has(token) || seen.has(token)) continue
    seen.add(token)
    const matches = onePerProject(projects.filter(p => p.file && (stem(p.file) === name || slug(p.name) === name))             )
    if (matches.length > 1) notes.push(`${token} fits ${matches.length} projects, so it stays as text: pick the project by hand.`)
    else if (matches.length === 1) found.set(token, matches[0])
  }

  const tokens = [...found.keys()]
  const files = new Set([...found.values()].map(p => p.file))
  let project                      = null
  if (files.size > 0 && kind?.kind === 'idea') {
    notes.push(`Ideas aren't filed under a project, so ${tokens.join(' and ')} ${tokens.length > 1 ? 'stay' : 'stays'} as text.`)
  } else if (files.size > 1) {
    notes.push(`${tokens.join(' and ')} name different projects, so they stay as text: pick the project by hand.`)
  } else if (files.size === 1) {
    const p = found.get(tokens[0])             
    project = { token: tokens[0], tokens, file: p.file, name: p.name, machine: p.machine, paired: Boolean(p.pairFile) }
  }
  return { kind, project, notes }
}

// The text as saved: the tokens in use come out, with the space or empty line they leave; nothing else is touched.
export function stripQuickAdd(body        , q          )         {
  let out = body
  if (q.kind) out = out.replace(KIND, '').replace(/^[ \t]+/, '')
  for (const token of q.project?.tokens ?? []) {
    const t = token.slice(1) // letters, digits and hyphens only, so safe in a pattern
    out = out
      .replace(new RegExp(`^#${t}[ \\t]*(?:\\r?\\n|$)`, 'gim'), '')
      .replace(new RegExp(`^#${t}[ \\t]+`, 'gim'), '')
      .replace(new RegExp(`[ \\t]+#${t}(?=\\s|$)`, 'gi'), '')
  }
  return out.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd()
}

const candidates = () => state.data?.projects.filter(p => p.file) ?? []

// What the draft will be saved as: a token's kind and project win over the form's, until they're kept as text.
export function effectiveDraft(d        = state.draft)                                                   {
  const q = parseQuickAdd(d.body, candidates(), d.keep ?? [])
  return { kind: q.kind?.kind ?? (q.project ? 'note' : d.kind), project: q.project?.file ?? d.project, q }
}

// The chips under the text box, and a one-line tip while the box is empty.
export function quickAddHtml(q          , isEmpty         )         {
  const chip = (label        , tokens          ) =>
    `<span class="token-chip">${label} <span class="muted">from ${esc(tokens.join(' '))}</span>
      <button type="button" class="link" data-action="keep-token" data-value="${esc(tokens.join(' '))}" aria-label="Keep ${esc(tokens.join(' '))} as text" title="Keep as text">✕</button></span>`
  const p = q.project
  const chips = [
    q.kind ? chip(q.kind.kind === 'idea' ? 'Idea' : 'Note', [q.kind.token]) : '',
    p ? chip(`Note on <strong>${esc(p.name)}</strong>${p.paired ? ` <span class="muted">(the ${esc(p.machine)}'s record)</span>` : ''}`, p.tokens) : '',
  ].filter(Boolean)
  const example = stem(candidates()[0]?.file ?? '') || 'project'
  if (isEmpty) return `<p class="muted small">Tip: #${esc(example)} files it under a project; idea: at the start makes it an idea.</p>`
  return `${chips.length ? `<div class="token-chips">${chips.join('')}</div>` : ''}${q.notes.map(n => `<p class="muted small">${esc(n)}</p>`).join('')}`
}

export const quickAddBox = (q          , isEmpty         ) =>
  `<div id="draft-tokens" class="draft-tokens" aria-live="polite">${quickAddHtml(q, isEmpty)}</div>`
