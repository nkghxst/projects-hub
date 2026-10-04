// Shared core of the projects hub: parsing and shaping only, no file, process or network access, so the
// same file runs in Node (the desktop server), in the browser (desktop window and, later, the phone) and,
// vendored, in the Claude Code pane. Type annotations only, so Node and the server's type stripping both
// accept it as is.

                                          
                                                                         
                                                                                          
                                                                             
                                                    

                                         
// Where a project stands for its owner: something waits on them, it's moving, it's on hold or blocked, or it's done.
                                                                  
// A sentence quoted from a record's current text where work waits on the owner, and where it was found.
                                                  
                                                                                                                          

                       
                  
              
               
              
                          
                         
                  
               
                  
               
                       
               
                                                                        
                                                 
                                                     
                   
              
               
                  
                     
              
                   
                   
 
                                                      
                                                                                                                      
                    
               
                   
                 
                         
                      
                       
                                                  
 
                                                                                                              
                                                                       

export const MACHINES            = ['desktop', 'laptop']

// Which hostname is which machine, read at runtime from claude-profile's sync.sh (`  HOST|laptop) M=laptop ;;`)
// so no hostname lives in this file, which is published with the phone app.
                                           
export function parseHosts(syncSh        )        {
  const hosts        = {}
  for (const m of syncSh.matchAll(/^\s*([A-Za-z0-9_-]+)\|[A-Za-z]+\)\s*M=(desktop|laptop)\b/gm)) hosts[m[1]] = m[2]           
  return hosts
}
export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
export const CHART_DAYS = 14

// Status steps and the two validated categorical slots (blue desktop, orange laptop) from the dataviz palette.
export const HEX                       = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  muted: '#898781',
  desktop: '#2a78d6',
  laptop: '#eb6834',
  ai: '#9085e9',
}

export const FLAGS                                                                          = [
  { flag: 'blocked', test: /\bblocked\b/i, icon: '⛔', label: 'blocked', tone: 'critical' },
  { flag: 'pending', test: /\bpending\b|\boutstanding\b|\bopen:/i, icon: '◔', label: 'pending', tone: 'warning' },
  {
    flag: 'unverified',
    test: /\bunverified\b|\buntested\b|\bunconfirmed\b|\bunresolved\b|\bnot established\b|\bnot rechecked\b/i,
    icon: '?',
    label: 'unverified',
    tone: 'muted',
  },
  { flag: 'hold', test: /^paused\b|\bhold\b/i, icon: '⏸', label: 'on hold', tone: 'muted' },
  { flag: 'done', test: /^completed\b/i, icon: '✓', label: 'done', tone: 'good' },
]
export const NEEDS_ATTENTION         = ['blocked', 'pending', 'unverified']

// A distinct glyph per state, so colour never carries it alone.
export const ROW_MARKS                                                                 = {
  good: { glyph: '✓', tone: 'good', label: 'passed or done' },
  warning: { glyph: '◔', tone: 'warning', label: 'open, pending or on hold' },
  critical: { glyph: '✕', tone: 'critical', label: 'failed or blocked' },
  evidence: { glyph: '↳', tone: 'muted', label: 'evidence and paths' },
  plain: { glyph: '•', tone: 'muted', label: 'other' },
}

export const SORTS                                   = [
  { value: 'checkpoint', label: 'Checkpoint date' },
  { value: 'edited', label: 'Last edited' },
  { value: 'index', label: 'Index order' },
]

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// 2026-09-25 | 2 October 2026 | 2 Oct | 1Oct18:27 | 28 Sep
const DATE =
  /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/gi
// - 2026-10-02 17:31Z — text
const LOG_LINE = /^- (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})Z\s+[—–-]+\s+(.*)$/
// **Label:** text, optionally as a list item
const LABELLED = /^\s*(?:[-*]\s+)?\*\*([^*]+?):?\*\*:?\s*(.*)$/
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/
const VERDICT = /(?<![\w*])((?:SOURCE |EVIDENCE )?PASS|FAIL(?:ED)?|HOLD|READY|BLOCKED|BLOCKER|NOT)(?![\w*])/g
const LONG_PARAGRAPH = 360
const HEADER_LINES = 12

// ---------- dates ----------

export const pad = (n        ) => String(n).padStart(2, '0')

// Today's local date as a UTC-midnight key, the same scale written dates are parsed onto.
export function todayKey(nowMs        )         {
  const d = new Date(nowMs)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

export const dayKeyOf = todayKey

// Every plausible date in the text as UTC midnights; a yearless date in the future is last year's.
export function datesIn(text        , nowMs        )           {
  const found           = []
  for (const m of text.matchAll(DATE)) {
    let t        
    if (m[1]) {
      t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    } else {
      const month = MONTHS.indexOf(m[5].toLowerCase())
      const year = m[6] ? Number(m[6]) : new Date(nowMs).getUTCFullYear()
      t = Date.UTC(year, month, Number(m[4]))
      if (!m[6] && t > nowMs + DAY_MS) t = Date.UTC(year - 1, month, Number(m[4]))
    }
    if (!Number.isNaN(t) && t <= nowMs + DAY_MS) found.push(t)
  }
  return found
}

// "today", "3d" for a day key; "<1h", "5h", "2d" for a timestamp.
export function ageLabel(ms               , nowMs        , isTimestamp         )         {
  if (ms === null) return '?'
  if (isTimestamp) {
    const hours = Math.floor((nowMs - ms) / HOUR_MS)
    if (hours < 1) return '<1h'
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }
  const days = Math.max(0, Math.round((todayKey(nowMs) - ms) / DAY_MS))
  return days === 0 ? 'today' : `${days}d`
}

export function freshTone(dayKey               , nowMs        )       {
  if (dayKey === null) return 'muted'
  const days = Math.round((todayKey(nowMs) - dayKey) / DAY_MS)
  return days <= 2 ? 'good' : days <= 7 ? 'warning' : 'muted'
}

export function fmtDay(dayKey        )         {
  const d = new Date(dayKey)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

export function fmtStamp(ms        , nowMs        )         {
  const d = new Date(ms)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return todayKey(ms) === todayKey(nowMs) ? `today ${hm}` : `${d.getDate()} ${MON[d.getMonth()]} ${hm}`
}

// ---------- indexes and records ----------

export const plain = (text        ) => text.replace(/\*\*|`/g, '').trim()

export function parseIndexRows(index        )             {
  const rows             = []
  for (const line of index.replace(/\r/g, '').split('\n')) {
    const cells = line.split('|').map(c => c.trim())
    if (cells.length < 5 || cells[1] === 'Project' || /^-+$/.test(cells[1])) continue
    rows.push({ name: plain(cells[1]), state: cells[2], fileName: cells[3].match(/\(([^)]+\.md)\)/)?.[1] ?? '' })
  }
  return rows
}

export const headerOf = (record        ) => record.replace(/\r/g, '').split('\n').slice(0, HEADER_LINES).join('\n')

// A project from its index row and the full text of its record (empty when there's none). `owner` is the owner's
// first name, from profile.md (ownerOf), used to find what waits on them.
export function buildProject(
  machine         ,
  row          ,
  record        ,
  edit                    ,
  nowMs        ,
  order        ,
  owner = '',
)          {
  const state = plain(row.state)
  const dates = [...datesIn(headerOf(record), nowMs), ...datesIn(row.state, nowMs)]
  const flags = FLAGS.filter(f => f.test.test(state)).map(f => f.flag)
  const facts = recordFacts(record, row.state, owner)
  return {
    machine,
    name: row.name,
    state,
    file: row.fileName ? `memory/${machine}/projects/${row.fileName}` : '',
    checkedMs: dates.length > 0 ? Math.max(...dates) : null,
    editedMs: edit?.atMs ?? null,
    editedOn: edit?.by ?? '',
    flags,
    pairFile: '',
    order,
    status: statusOf(flags, facts.waits),
    ...facts,
  }
}

export function statusOf(flags        , waits        )                {
  if (waits.length > 0) return 'waiting'
  if (flags.includes('done')) return 'done'
  if (flags.includes('blocked') || flags.includes('hold')) return 'hold'
  return 'active'
}

// Records with the same file name on both machines point at each other.
export function pairProjects(list           )            {
  return list.map(p => {
    const base = p.file.split('/').pop()
    const other = list.find(o => o.machine !== p.machine && o.file !== '' && o.file.split('/').pop() === base)
    return other ? { ...p, pairFile: other.file } : p
  })
}

// Who made a commit: "auto-sync from HOST" becomes that host's machine; anything else keeps its subject.
export function commitBy(subject        , hosts       )         {
  const host = subject.match(/^auto-sync from (\S+)/)?.[1]
  return host ? (hosts[host] ?? host) : subject
}

// One `%ct<TAB>%s` line.
export function parseCommit(line        , hosts        = {})         {
  const tab = line.indexOf('\t')
  return { atMs: Number(line.slice(0, tab)) * 1000, by: commitBy(line.slice(tab + 1).trim(), hosts) }
}

// `git log --format=@%ct%x09%s --name-only`: the newest commit touching each file.
export function parseEditLog(log        , hosts        = {})                         {
  const out                         = {}
  let current                = null
  for (const raw of log.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('@')) current = parseCommit(line.slice(1), hosts)
    else if (line !== '' && current !== null && !(line in out)) out[line] = current
  }
  return out
}

export function parseHistory(log        , hosts        = {})           {
  return log
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .map(l => parseCommit(l, hosts))
}

// ---------- phone notes and ideas ----------

// One file per note under memory/phone/, written only by the phone; the machines just pull them in.
//   memory/phone/notes/2026-10-03-091502-short-title.md   a note on a project
//   memory/phone/ideas/2026-10-03-091502-short-title.md   an idea, not tied to a project
// A header of `key: value` lines (project first, for notes), a blank line, then the text.
export const PHONE_DIR = 'memory/phone'
                                      
                                                                                                                                   

export function parseNote(path        , text        )       {
  const lines = text.replace(/\r/g, '').split('\n')
  const fields                         = {}
  let i = 0
  while (i < lines.length && /^[a-z]+:\s/.test(lines[i])) {
    const at = lines[i].indexOf(':')
    fields[lines[i].slice(0, at)] = lines[i].slice(at + 1).trim()
    i++
  }
  const body = lines.slice(i).join('\n').trim()
  return {
    path,
    kind: path.includes('/ideas/') ? 'idea' : 'note',
    project: fields.project ?? '',
    title: fields.title || body.split('\n')[0].slice(0, 80) || fields.source || '(untitled)',
    captured: fields.captured ?? '',
    source: fields.source ?? '',
    body,
  }
}

export function slugify(text        )         {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'note'
  )
}

// A random 64-bit ID for each capture (16 hex characters). It goes into the file name, which makes two notes sharing a
// path vanishingly unlikely even with the same title in the same second, and it stays fixed when a send is retried.
// Uniqueness isn't assumed anywhere it matters: a clash with an existing file is a visible conflict, and a clash in
// the phone's queue is checked before saving.
export function noteId()         {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

// A short, stable fingerprint of a string (cyrb53, 53 bits, as hex). Not for security: it gives notes migrated from
// the old queue format the same ID however many times migration runs, and different notes different IDs.
export function stableId(text        )         {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

// http(s) addresses only: anything else (javascript:, data:, file:) is never treated as a link.
export const isWebUrl = (url        ) => /^https?:\/\/[^\s"<>]+$/i.test(url.trim())

// A new note's ID, path and file text. The time is local, as the owner reads it. A note needs text or a link.
export function formatNote(
  draft                                                                                  ,
  nowMs        ,
  id         = noteId(),
)                                             {
  const d = new Date(nowMs)
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const title = (draft.title.trim() || draft.body.trim().split('\n')[0] || draft.source.trim()).slice(0, 80)
  const captured = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const header = [
    ...(draft.kind === 'note' && draft.project ? [`project: ${draft.project}`] : []),
    `title: ${title.replace(/\n/g, ' ')}`,
    `captured: ${captured}`,
    ...(draft.source.trim() ? [`source: ${draft.source.trim()}`] : []),
  ]
  return {
    id,
    path: `${PHONE_DIR}/${draft.kind === 'idea' ? 'ideas' : 'notes'}/${stamp}-${slugify(title)}-${id}.md`,
    text: `${header.join('\n')}\n\n${draft.body.trim()}\n`,
  }
}

// The same patterns sync.sh refuses to publish; phone commits never pass through sync.sh, so the app checks.
export function looksLikeSecret(text        )          {
  return /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|sk-ant-|sk-[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16}|xox[abprs]-|BEGIN [A-Z ]*PRIVATE KEY/.test(text)
}

// Newest first.
export function parseLogEntries(text        , limit        )              {
  const entries              = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const m = raw.trim().match(LOG_LINE)
    if (m) {
      const atMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
      entries.push({ atMs, text: m[6].trim() })
    }
  }
  return entries.slice(-limit).reverse()
}

function callout(lines          , label        )         {
  for (const line of lines) {
    const m = line.match(LABELLED)
    if (m && label.test(m[1].trim()) && m[2].trim() !== '') return m[2].trim()
  }
  return ''
}

// The section holding the record's current answer: the first titled "Current…" or "Latest…" (records keep older
// checkpoints below with the same heading), otherwise the first section. Only this one gets the accent.
export function currentSectionIndex(titles          )         {
  const i = titles.findIndex(t => /^(?:current|latest)\b/i.test(t.trim()))
  return i === -1 ? 0 : i
}

export function parseDoc(path        , text        )                       {
  const lines = text.replace(/\r/g, '').split('\n')
  let title = path.split('/').pop() ?? path
  let hasTitle = false
  const preamble           = []
  const sections            = []

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    if (h1 && !hasTitle && sections.length === 0) {
      title = h1[1].trim()
      hasTitle = true
    } else if (h2) {
      sections.push({ title: h2[1].trim(), body: '' })
    } else if (sections.length === 0) {
      preamble.push(line)
    } else {
      sections[sections.length - 1].body += `${line}\n`
    }
  }

  return {
    path,
    title,
    preamble: preamble.join('\n').trim(),
    sections: sections.map(s => ({ title: s.title, body: s.body.trim() })),
    next: callout(lines, /^next\b/i),
    readFirst: callout(lines, /^read first\b/i),
  }
}

// ---------- what a record says now: Next, what waits on the owner, who worked on it last ----------

// The owner's first name, from profile.md's "# About <Name>" heading; read at runtime, so no name lives in this file.
export function ownerOf(profile        )         {
  return profile.match(/^# About ([^\s(]+)/m)?.[1] ?? ''
}

const escapeRegExp = (s        ) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Sentences where work waits on the owner: a decision, choice, approval, go-ahead or action that's theirs. It's a
// keyword heuristic, so the app quotes the sentence rather than interpreting it, and it can miss some.
                                                            
function waitPatterns(owner        )               {
  if (!owner) return { anywhere: [], inNext: [] }
  const n = escapeRegExp(owner)
  const asks = '(?:decision|choice|approval|go-ahead|review|input|answer|sign-off|confirmation|call)'
  const acts = '(?:decide|choose|pick|approve|confirm|review|start|launch|run|test|check|install|reply|answer|sign off|accept)'
  return {
    anywhere: [
      new RegExp(`\\b(?:wait(?:s|ing)?|await(?:s|ing)?|held|holds|pending|parked|paused|blocked)\\b[^.;]{0,30}?\\b(?:on|for|until)\\s+${n}\\b`, 'i'),
      new RegExp(`\\bpending\\s+${n}\\b`, 'i'),
      new RegExp(`\\b(?:pending|awaiting|until|after|needs?|requires?)\\s+${n}(?:'s|’s)\\s+(?:explicit\\s+|final\\s+)?${asks}\\b`, 'i'),
      new RegExp(`\\b${n}\\s+(?:to|must|needs to|has to)\\s+${acts}\\b`, 'i'),
      new RegExp(`\\b(?:decisions?|questions?)\\s+for\\s+${n}\\b`, 'i'),
    ],
    // "Sam reviews the build" is a to-do on a Next line, but elsewhere it usually describes a role ("Sam decides
    // only", "Sam launches the app"), so the present tense only counts there.
    inNext: [new RegExp(`\\b${n}\\s+(?:decides|chooses|picks|approves|confirms|reviews|tests|checks|starts|launches|installs|runs|signs off)\\b`, 'i')],
  }
}
// "Next: …", "**Next:** …" or "**Next**: …", as a line or a list item.
const NEXT_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*next:\*\*|\*\*next\*\*:|next:)\s*(.*)$/i
// A wait that has ended or is only being reported: these sentences are history, not a current ask.
const NOT_WAITING = /\b(?:no longer|not (?:waiting|needed|blocked)|was waiting|were waiting|waited|resolved|withdrawn|superseded)\b/i

// The sentences of some markdown, with list markers and struck-out text removed.
function sentencesOf(md        )           {
  const out           = []
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/~~[^~]*~~/g, ' ').replace(LIST_ITEM, '').replace(/^#+\s+/, '').trim()
    if (line === '' || line.startsWith('|')) continue
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z"“(*])/)) if (s.trim()) out.push(s.trim())
  }
  return out
}

function findWaits(md        , where        , patterns              , isNext = false)         {
  if (patterns.anywhere.length === 0) return []
  return sentencesOf(md)
    .filter(s => {
      // Quoted text ("…", “…”, `…`) is someone else's words or an example, never the record's own ask.
      const bare = s.replace(/"[^"]*"|“[^”]*”|`[^`]*`/g, ' ')
      const usable = isNext || NEXT_LINE.test(s) ? [...patterns.anywhere, ...patterns.inNext] : patterns.anywhere
      return usable.some(p => p.test(bare)) && !NOT_WAITING.test(bare)
    })
    // Quoted as plain text: bold and code marks dropped, and links reduced to their text.
    .map(s => ({ text: plain(s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')).slice(0, 280), where }))
}

// Claude or Codex, when the text names exactly one of them; Codeg when the work ran inside it.
function providerIn(text        )                                                   {
  const isClaude = /\bClaude\b/i.test(text)
  const isCodex = /\bCodex\b/i.test(text)
  return { provider: isClaude === isCodex ? null : isClaude ? 'claude' : 'codex', viaCodeg: /\bCodeg\b/i.test(text) }
}

const CURRENT_TITLE = /^(?:current|latest)\b/i

// What a record says now. Only current text counts: the index row, the record's Next line, and its section titled
// "Current…" or "Latest…" (none counts when no section is). Older checkpoints and undated sections are history.
export function recordFacts(record        , rowState        , owner        )              {
  const doc = parseDoc('', record)
  const current = doc.sections.find(s => CURRENT_TITLE.test(s.title))
  const patterns = waitPatterns(owner)
  const seen = new Set        ()
  const key = (text        ) => text.replace(/^[^:]{0,24}:\s*/, '').toLowerCase()
  const waits = [
    ...findWaits(rowState, 'index row', patterns),
    ...(current ? findWaits(current.body, current.title, patterns) : []),
    ...findWaits(doc.next, 'Next', patterns, true),
  ].filter(w => !seen.has(key(w.text)) && seen.add(key(w.text)))
  const rowNext = plain(rowState).match(/\bnext:\s*(.+?)\s*$/i)?.[1] ?? ''
  // A plain "- Next: …" line in the current checkpoint counts as its Next when there's no bold **Next:** callout.
  const bodyNext = current?.body.split('\n').map(l => l.match(NEXT_LINE)?.[1]?.trim() ?? '').find(Boolean) ?? ''
  // Who worked on it last: the current heading, else its Updated line; no tag when neither names one provider.
  const fromTitle = providerIn(current?.title ?? '')
  const updated = current?.body.split('\n').find(l => /\*\*Updated:?\*\*/i.test(l)) ?? ''
  const fromUpdated = providerIn(updated)
  const who = fromTitle.provider ? fromTitle : fromUpdated
  return {
    next: doc.next || bodyNext || rowNext,
    readFirst: doc.readFirst,
    waits: waits.slice(0, 3),
    provider: who.provider,
    viaCodeg: fromTitle.viaCodeg || fromUpdated.viaCodeg,
  }
}

// Resolve a relative link against a repo directory; null when it climbs out of the repo.
export function resolvePath(dir        , rel        )                {
  const parts = dir === '' ? [] : dir.split('/')
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else {
      parts.push(seg)
    }
  }
  return parts.join('/')
}

// ---------- live work ----------

export function liveFor(file        , sources        )                   {
  return sources.find(l => l.records.includes(file))
}

// The live source when it has activity on a later day than the record's written checkpoint.
export function notesBehind(p         , sources        )                   {
  const source = liveFor(p.file, sources)
  if (!source || source.latestMs === null) return undefined
  return p.checkedMs === null || dayKeyOf(source.latestMs) > p.checkedMs ? source : undefined
}

export function sorter(sort      ) {
  if (sort === 'index') return (a         , b         ) => a.order - b.order
  if (sort === 'edited') return (a         , b         ) => (b.editedMs ?? -1) - (a.editedMs ?? -1)
  return (a         , b         ) => (b.checkedMs ?? -1) - (a.checkedMs ?? -1) || a.order - b.order
}

export function kpis(list           , sources        , nowMs        ) {
  const tones = list.map(p => freshTone(p.checkedMs, nowMs))
  const undated = list.filter(p => p.checkedMs === null).length
  const fresh = tones.filter(t => t === 'good').length
  const week = tones.filter(t => t === 'warning').length
  return {
    fresh,
    week,
    older: list.length - undated - fresh - week,
    undated,
    behind: list.filter(p => notesBehind(p, sources)).length,
    attention: list.filter(p => p.flags.some(x => NEEDS_ATTENTION.includes(x))).length,
  }
}

// ---------- readable layout (display only; files are never changed) ----------

// Split at sentence ends outside code spans: ". " followed by something that starts a sentence.
export function sentences(text        )           {
  const out           = []
  let start = 0
  let inCode = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '`') {
      inCode = !inCode
    } else if (!inCode && (ch === '.' || ch === '!' || ch === '?') && text[i + 1] === ' ' && /[A-Z(`*"“]/.test(text[i + 2] ?? '')) {
      out.push(text.slice(start, i + 1).trim())
      start = i + 2
    }
  }
  const tail = text.slice(start).trim()
  if (tail !== '') out.push(tail)
  return out
}

// Bold verdict words outside code spans and outside text that is already bold.
export function boldVerdicts(line        )         {
  return line
    .split('`')
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment.replace(VERDICT, (word        , _w        , at        ) =>
            ((segment.slice(0, at).match(/\*\*/g) ?? []).length % 2 === 1 ? word : `**${word}**`),
          ),
    )
    .join('`')
}

// Capitalised verdicts are deliberate in these records, so they're checked first and case-sensitively;
// ordinary words come after. A plain lowercase "not" says nothing about status.
const CRITICAL_WORDS = /\b(?:FAIL(?:ED)?|BLOCKED|BLOCKER)\b|\b(?:[Bb]locked|[Ff]ailed|[Ff]ails|[Bb]roken)\b/
const WARNING_VERDICT = /\b(?:HOLD|NOT)\b/
const GOOD_VERDICT = /\bPASS\b/
const WARNING_WORDS =
  /\b(?:on hold|pending|paused|unverified|untested|unconfirmed|unresolved|waiting|waits|not (?:established|yet|verified|confirmed|tested|recorded)|remains? (?:open|unverified|untested))\b/i
const GOOD_WORDS = /\b(?:pass(?:es|ed)?|accepted|merged|verified|confirmed|approved|done|released|works)\b/i

export function toneOf(text        )           {
  const prose = text.replace(/`[^`]*`/g, '')
  if (CRITICAL_WORDS.test(prose)) return 'critical'
  if (WARNING_VERDICT.test(prose)) return 'warning'
  if (GOOD_VERDICT.test(prose)) return 'good'
  if (WARNING_WORDS.test(prose)) return 'warning'
  if (GOOD_WORDS.test(prose)) return 'good'
  const code = (text.match(/`[^`]*`/g) ?? []).join('').length
  if (/^evidence\b/i.test(prose.trim()) || code > text.length / 2) return 'evidence'
  return 'plain'
}

// The readable layout as Markdown text, for places that draw one Markdown block: long paragraphs and list
// items become one bullet per sentence, short ones keep their lines, and verdict words are bolded.
export function readable(md        )         {
  const out           = []
  let block           = []
  let inFence = false

  const flush = () => {
    if (block.length === 0) return
    const item = block[0].match(LIST_ITEM)
    const joined = block.map(l => l.trim()).join(' ')
    if (joined.length < LONG_PARAGRAPH) {
      out.push(...block)
    } else if (item) {
      const [first, ...rest] = sentences(joined.slice(joined.indexOf(item[2]) + item[2].length).trim())
      out.push(`${item[1]}${item[2]} ${first ?? ''}`, ...rest.map(s => `${item[1]}  - ${s}`))
    } else {
      out.push(...sentences(joined).map(s => `- ${s}`))
    }
    block = []
  }

  for (const line of md.split('\n')) {
    if (line.trim().startsWith('```')) {
      flush()
      inFence = !inFence
      out.push(line)
    } else if (inFence) {
      out.push(line)
    } else if (line.trim() === '' || /^\s*(#|\||>)/.test(line)) {
      flush()
      out.push(line)
    } else if (LIST_ITEM.test(line)) {
      flush()
      block = [line]
    } else {
      block.push(line)
    }
  }
  flush()

  let isFenced = false
  return out
    .map(line => {
      if (line.trim().startsWith('```')) isFenced = !isFenced
      return isFenced ? line : boldVerdicts(line)
    })
    .join('\n')
}

// One row per sentence or list item; headings, tables, quotes, code fences and short paragraphs stay Markdown.
export function readableRows(md        )        {
  const rows        = []
  let block           = []
  let fence                  = null

  const pushMd = (text        ) => {
    const last = rows[rows.length - 1]
    if (last && last.kind === 'md') last.text += `\n${text}`
    else rows.push({ kind: 'md', text })
  }
  const flush = () => {
    if (block.length === 0) return
    const item = block[0].match(LIST_ITEM)
    const joined = block.map(l => l.trim()).join(' ')
    if (item) {
      const depth = Math.floor(item[1].replace(/\t/g, '  ').length / 2)
      const text = joined.slice(item[2].length).trim()
      const parts = text.length < LONG_PARAGRAPH ? [text] : sentences(text)
      parts.forEach((s, i) => rows.push({ kind: 'line', text: s, depth: depth + (i === 0 ? 0 : 1), tone: toneOf(s) }))
    } else if (joined.length < LONG_PARAGRAPH) {
      pushMd(block.join('\n'))
      pushMd('')
    } else {
      for (const s of sentences(joined)) rows.push({ kind: 'line', text: s, depth: 0, tone: toneOf(s) })
    }
    block = []
  }

  for (const line of md.split('\n')) {
    if (fence !== null) {
      fence.push(line)
      if (line.trim().startsWith('```')) {
        pushMd(fence.join('\n'))
        fence = null
      }
    } else if (line.trim().startsWith('```')) {
      flush()
      fence = [line]
    } else if (line.trim() === '') {
      flush()
    } else if (/^\s*(#|\||>)/.test(line)) {
      flush()
      pushMd(line)
    } else if (LIST_ITEM.test(line)) {
      flush()
      block = [line]
    } else {
      block.push(line)
    }
  }
  flush()
  if (fence !== null) pushMd(fence.join('\n'))
  return rows.filter(r => r.kind === 'line' || r.text.trim() !== '')
}

// Inline pieces of a row: bold and code spans.
export function spansOf(text        )         {
  const out         = []
  let last = 0
  for (const m of text.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    out.push(m[1] !== undefined ? { text: m[1], isCode: true } : { text: m[2], isBold: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

// ---------- summaries ----------

// Sections shorter than this aren't worth summarising.
export const SUMMARY_MIN = 1200
// Sonnet first; haiku only when sonnet is rate-limited or overloaded.
export const SUMMARY_MODELS = ['sonnet', 'haiku']

// A cached summary: the model that actually wrote it, and why when a fallback did.
                                                                                  

// A fingerprint of a section's exact text (the first 8 bytes of its SHA-256, as hex). Summaries are cached
// under it, so one is reused until the text changes. crypto.subtle exists in Node, browsers and the pane.
export async function sectionHash(text        )                  {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// The Claude Code CLI run for one summary, isolated from the owner's own setup: no user settings (so no hooks or
// mods), no MCP servers, no tools, no saved transcript, and a short system prompt of its own. The prompt goes
// on standard input; run it with SUMMARY_ENV set over the environment.
export function summaryArgs(model        )           {
  return [
    '-p',
    '--model', model,
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--tools', '',
    '--no-session-persistence',
    '--output-format', 'json',
    '--system-prompt', SUMMARY_SYSTEM,
  ]
}
export const SUMMARY_ENV                         = { PROFILE_SYNC: 'off', CLAUDE_CODE_PLUGIN_DIRS: '' }

                                                                                                                    

// Reads `claude -p --output-format json`. Its usage can list a helper call as well (haiku beside sonnet),
// so the writer is the model with the most output.
export function parseClaudeReply(stdout        , model        , failure        )              {
  let reply   
                      
                    
                    
                                    
                                                          
   
  try {
    reply = JSON.parse(stdout)
  } catch {
    return { ok: false, isBusy: false, reason: `${model}: ${failure || 'no reply'}` }
  }
  const usage = Object.entries(reply.modelUsage ?? {})
  const writer = usage.sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0]?.[0] ?? model
  if (!reply.is_error && typeof reply.result === 'string' && reply.result.trim() !== '') {
    return { ok: true, text: reply.result.trim(), model: writer }
  }
  const status = reply.api_error_status
  return {
    ok: false,
    isBusy: status === 429 || status === 529,
    reason: `${model}: ${reply.subtype ?? 'error'}${status ? ` (${status})` : ''}`,
  }
}

export const SUMMARY_SYSTEM =
  "You summarise project status notes for the person who owns the project. They know the project but aren't deeply " +
  'technical, so use plain UK English. Use only facts stated in the text. Copy numbers, names, versions and dates exactly; ' +
  "never add, round or estimate any. If something is unclear, say it's unclear rather than guessing."

export function summaryPrompt(project        , sectionTitle        , body        )         {
  return (
    `Project: ${project}\nSection: ${sectionTitle}\n\n` +
    'Summarise this section in at most 6 short bullet points, in this order where the text supports it: where things ' +
    'stand; what was proven or passed; what is on hold or blocked, and why; what happens next and who decides. Leave out ' +
    'hashes, file paths and commit ids unless one is essential. Reply with markdown bullets only, no heading.\n\n' +
    `<section>\n${body}\n</section>`
  )
}

// ---------- chart ----------

const esc = (s        ) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n1 = (n        ) => n.toFixed(1)

// Class names are prefixed, since the SVG may sit inline in a page with its own styles.
const CHART_CSS =
  '.hub-d{fill:#2a78d6}.hub-l{fill:#eb6834}.hub-base{stroke:#c3c2b7;stroke-width:1}.hub-hit{fill:transparent}' +
  '.hub-col:hover .hub-hit{fill:rgba(137,135,129,.14)}.hub-lbl{fill:#898781;font:10px system-ui,sans-serif}.hub-now{font-weight:700}' +
  '@media (prefers-color-scheme: dark){.hub-d{fill:#3987e5}.hub-l{fill:#d95926}.hub-base{stroke:#383835}}'

function topRounded(x        , y        , w        , h        , cls        )         {
  const r = Math.min(4, w / 2, h)
  return (
    `<path class="${cls}" d="M${n1(x)} ${n1(y + h)}V${n1(y + r)}Q${n1(x)} ${n1(y)} ${n1(x + r)} ${n1(y)}` +
    `H${n1(x + w - r)}Q${n1(x + w)} ${n1(y)} ${n1(x + w)} ${n1(y + r)}V${n1(y + h)}Z"/>`
  )
}

// Stacked columns: records whose written checkpoint falls on each of the last 14 days, by machine.
export function activityChart(list           , nowMs        , width        ) {
  const today = todayKey(nowMs)
  const height = 74
  const base = 58
  const slot = width / CHART_DAYS
  const barW = Math.max(4, Math.min(18, slot - 6))
  const cols = Array.from({ length: CHART_DAYS }, (_, i) => ({
    day: today - (CHART_DAYS - 1 - i) * DAY_MS,
    desktop: []            ,
    laptop: []            ,
  }))
  let outside = 0
  for (const p of list) {
    const col = p.checkedMs === null ? undefined : cols.find(c => c.day === p.checkedMs)
    if (col) col[p.machine].push(p.name)
    else outside += 1
  }
  const max = Math.max(4, ...cols.map(c => c.desktop.length + c.laptop.length))
  const unit = (base - 6) / max
  const parts           = []
  const alt           = []

  cols.forEach((c, i) => {
    const x = i * slot + (slot - barW) / 2
    const hD = c.desktop.length * unit
    const hL = c.laptop.length * unit
    const label = fmtDay(c.day)
    const names = [...c.desktop.map(n => `${n} (desktop)`), ...c.laptop.map(n => `${n} (laptop)`)]
    const tip =
      names.length === 0
        ? `${label}: none`
        : `${label}: ${c.desktop.length} desktop, ${c.laptop.length} laptop\n${names.slice(0, 10).join('\n')}` +
          (names.length > 10 ? `\n+${names.length - 10} more` : '')
    let g = `<g class="hub-col"><title>${esc(tip)}</title><rect class="hub-hit" x="${n1(i * slot)}" y="0" width="${n1(slot)}" height="${base}"/>`
    if (hD > 0) {
      g +=
        hL > 0
          ? `<rect class="hub-d" x="${n1(x)}" y="${n1(base - hD)}" width="${n1(barW)}" height="${n1(hD)}"/>`
          : topRounded(x, base - hD, barW, hD, 'hub-d')
    }
    if (hL > 0) g += topRounded(x, base - hD - (hD > 0 ? 2 : 0) - hL, barW, hL, 'hub-l')
    if (slot >= 16 || i % 2 === (CHART_DAYS - 1) % 2) {
      const cls = i === CHART_DAYS - 1 ? 'hub-lbl hub-now' : 'hub-lbl'
      g += `<text class="${cls}" x="${n1(i * slot + slot / 2)}" y="${height - 3}" text-anchor="middle">${new Date(c.day).getUTCDate()}</text>`
    }
    parts.push(`${g}</g>`)
    if (names.length > 0) alt.push(`${label}: ${c.desktop.length} desktop, ${c.laptop.length} laptop`)
  })

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${height}" viewBox="0 0 ${n1(width)} ${height}" role="img" aria-label="${esc(`Checkpoints written per day, last ${CHART_DAYS} days. ${alt.join('; ') || 'None.'}`)}">` +
    `<style>${CHART_CSS}</style><line class="hub-base" x1="0" x2="${n1(width)}" y1="${base + 0.5}" y2="${base + 0.5}"/>` +
    `${parts.join('')}</svg>`
  return {
    source,
    alt: `Checkpoints written per day, last ${CHART_DAYS} days. ${alt.join('; ') || 'None.'}`,
    width,
    height,
    outside,
  }
}
