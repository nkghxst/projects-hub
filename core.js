// Shared core of the projects hub: parsing and shaping only, no file, process or network access, so the
// same file runs in Node (the desktop server), in the browser (desktop window and, later, the phone) and,
// vendored, in the Claude Code pane. Type annotations only, so Node and the server's type stripping both
// accept it as is.

                                          
                                                                         
                                                                                          
                                                                             
                                                    

                                         
// Where a project stands for its owner: something waits on them, it's moving, it's on hold or blocked, or it's done.
                                                                               
// A sentence quoted from a record's current text where work waits on the owner, and where it was found.
// isStated: the record says it outright ("Waiting on Sam: …"); otherwise it's a keyword match, a possible ask.
                                                                     
                           
              
                                                                                                                     
                   
                        
                   
               
                           
                   
                       
                                                                                                                    
                                                                                                 
                   
                      
                                                                                                                     
                                                                                    
                       
                            
 

                       
                  
              
               
              
                          
                         
                  
               
                  
               
                                                                                                               
                       
                                                                                                                   
                           
                                                                                     
                                
               
                                                                        
                                                 
                                                     
                   
              
               
                  
                     
              
                   
                   
                   
 
                                                      
                                                                                                                      
                    
               
                   
                 
                         
                      
                       
                                                  
 
                                                                                                              
                                                                       

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
  { flag: 'hold', test: /\b(?:paused|on hold|hold)\b/i, icon: '⏸', label: 'on hold', tone: 'muted' },
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
// Markdown as plain text for places that can't show links: bold and code marks dropped, links reduced to their text.
export const textOf = (md        ) => plain(md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))

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
  extra                                                                         = {},
)          {
  const state = plain(row.state)
  const dates = [...datesIn(headerOf(record), nowMs), ...datesIn(row.state, nowMs)]
  const flags = FLAGS.filter(f => affirms(f.test, state)).map(f => f.flag)
  const facts = recordFacts(record, row.state, extra.owner ?? '')
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
    updatedDays: extra.updatedDays ?? [],
    activityComplete: extra.activityComplete ?? true,
    prints: sectionPrints(record),
    ...facts,
  }
}


// Records with the same file name on both machines point at each other.
export function pairProjects(list           )            {
  return list.map(p => {
    const base = p.file.split('/').pop()
    const other = list.find(o => o.machine !== p.machine && o.file !== '' && o.file.split('/').pop() === base)
    return other ? { ...p, pairFile: other.file } : p
  })
}

// Who made a commit: "auto-sync from HOST" becomes that host's machine, the phone's own commits ("Phone note: …",
// "Phone idea: …", "Phone: handled …") become 'phone'; anything else keeps its subject.
export function commitBy(subject        , hosts       )         {
  const host = subject.match(/^auto-sync from (\S+)/)?.[1]
  if (host) return hosts[host] ?? host
  return /^Phone\b/.test(subject) ? 'phone' : subject
}

// When each device last published a change to the profile: its newest commit. A sync with nothing new to publish
// leaves no commit, so this is "last change published", not "last synced".
// `unpublished`: commits this computer has made but not yet pushed (the desktop server knows; the phone doesn't).
                                                                                                                     
export function publishedBy(commits          )            {
  const out            = { desktop: null, laptop: null, phone: null }
  for (const c of commits) {
    if (c.by === 'desktop' || c.by === 'laptop' || c.by === 'phone') out[c.by] = Math.max(out[c.by] ?? 0, c.atMs)
  }
  return out
}

// A fingerprint of each part of a record, keyed by its title in lower case: what a device remembers so it can tell later
// which sections changed. The text above the first heading is '#top'; a second section with the same title is
// "title (2)", and so on, so neither overwrites the other. Sections are matched by title, so moving one isn't a change.
export const TOP_PRINT = '#top'
export function printsOf(doc                                                                   )                         {
  const out                         = {}
  if (doc.preamble.trim()) out[TOP_PRINT] = stableId(doc.preamble)
  const seen = new Map                ()
  for (const s of doc.sections) {
    const title = s.title.trim().toLowerCase()
    const n = (seen.get(title) ?? 0) + 1
    seen.set(title, n)
    out[n === 1 ? title : `${title} (${n})`] = stableId(s.body)
  }
  return out
}
export const sectionPrints = (record        ) => printsOf(parseDoc('', record))

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

// The same log: the local days (as day keys) on which each file changed, newest first, each day once.
export function parseEditDays(log        )                           {
  const out                           = {}
  let day                = null
  for (const raw of log.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('@')) day = dayKeyOf(parseCommit(line.slice(1)).atMs)
    else if (line !== '' && day !== null && !(out[line] ??= []).includes(day)) out[line].push(day)
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

// ---------- notes and ideas ----------

// One file per note, in the folder of the device that captured it, written only by that device:
//   memory/phone/notes/2026-10-03-091502-short-title-<id>.md     from the phone
//   memory/desktop/ideas/2026-10-03-091502-short-title-<id>.md   from the desktop app
// A header of `key: value` lines (project first, for notes), a blank line, then the text. Whether a note has been
// handled is recorded separately, as marks (below), so the original never changes.
export const PHONE_DIR = 'memory/phone'
export const DESKTOP_NOTES_DIR = 'memory/desktop'
export const NOTE_DIRS = [PHONE_DIR, DESKTOP_NOTES_DIR]
                                      
                    
              
                
                 
               
                  
                
              
                                                                                                               
                             
                    
                                                                                                                     
                                          
                            
 
export const noteOrigin = (path        ) => (path.startsWith('memory/desktop/') ? 'desktop' : path.startsWith('memory/laptop/') ? 'laptop' : 'phone')

// A path a writer may create a note at: its own notes or ideas folder, and a stamped, slugged, ID-bearing name.
export function isCapturePath(path        , dir        )          {
  return new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:notes|ideas)/\\d{4}-\\d{2}-\\d{2}-\\d{6}-[a-z0-9-]+-[0-9a-f]{16}\\.md$`).test(path)
}

// ---------- handled marks ----------

// Marking a note handled (or open again) writes a small file in the marking device's own folder, never touching the
// note: memory/phone/handled/ for the phone, memory/desktop/hub/handled/ for the desktop app. Each mark is a new file
// (create-only, like notes), and the newest mark for a note, from any device, decides.
//   note: memory/phone/notes/2026-10-04-121449-test2-….md
//   handled: yes
//   at: 2026-10-04T13:00:00.000Z
                                                                                      
export const MARK_DIRS = [`${PHONE_DIR}/handled`, `${DESKTOP_NOTES_DIR}/hub/handled`]

export function formatHandledMark(note        , handled         , nowMs        , id        , dir        )                                 {
  const d = new Date(nowMs)
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return { path: `${dir}/handled/${stamp}-${id}.md`, text: `note: ${note}\nhandled: ${handled ? 'yes' : 'no'}\nat: ${d.toISOString()}\n` }
}

export function isMarkPath(path        , dir        )          {
  return path.startsWith(`${dir}/handled/`) && /\/\d{4}-\d{2}-\d{2}-\d{6}-[0-9a-f]{16}\.md$/.test(path)
}

export function parseHandledMark(path        , text        )                     {
  const field = (key        ) => text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim() ?? ''
  const note = field('note')
  const handled = field('handled')
  const atMs = Date.parse(field('at'))
  if (!/^memory\/[\w./-]+\.md$/.test(note) || !/^(?:yes|no)$/.test(handled) || !Number.isFinite(atMs)) return null
  return { note, handled: handled === 'yes', atMs, by: noteOrigin(path) }
}

// The newest mark for each note, by the marking device's clock (a device whose clock runs fast can win over a later
// mark from one whose clock is slow; marks are rare enough for that to be acceptable). Equal times are settled by
// device name, then by `handled` ("open" wins), so every device reaches the same answer.
export function handledNotes(marks                        )                           {
  const out = new Map                     ()
  const isNewer = (m             , o             ) =>
    m.atMs !== o.atMs ? m.atMs > o.atMs : m.by !== o.by ? m.by > o.by : !m.handled && o.handled
  for (const m of marks) if (m && (!out.has(m.note) || isNewer(m, out.get(m.note) ))) out.set(m.note, m)
  return out
}

// Notes with their handled state filled in from the marks, newest first (file names start with the capture time).
export function withHandled(notes        , marks                        )         {
  const state = handledNotes(marks)
  return notes
    .map(n => {
      const m = state.get(n.path)
      return { ...n, handledAtMs: m?.handled ? m.atMs : null, handledBy: m?.handled ? m.by : '', markedAtMs: m?.atMs ?? null }
    })
    .sort((a, b) => (a.path.split('/').pop()  < b.path.split('/').pop()  ? 1 : -1))
}

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
  dir         = PHONE_DIR,
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
    path: `${dir}/${draft.kind === 'idea' ? 'ideas' : 'notes'}/${stamp}-${slugify(title)}-${id}.md`,
    text: `${header.join('\n')}\n\n${draft.body.trim()}\n`,
  }
}

// The same patterns sync.sh refuses to publish; notes don't all pass through sync.sh, so the app checks.
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

// "Label: text" as bold (**Label:**), plain (Label:) or a list item. When the label line itself is empty, the list
// under it is the value ("**Next action:**" followed by numbered steps), joined with semicolons.
const PLAIN_LABEL = /^\s*(?:[-*+]\s+)?([A-Z][^:*`[\]()]{0,32}):\s*(.*)$/
function labelled(text        , label        )         {
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LABELLED) ?? lines[i].match(PLAIN_LABEL)
    if (!m || !label.test(m[1].trim())) continue
    if (m[2].trim() !== '') return m[2].trim()
    // The list under it: bullets or numbers, indented or not, with wrapped lines joined to their item. It ends at a
    // blank line, plain text, or a sibling bold field ("- **Pipeline:**").
    const items           = []
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.trim() === '') break
      const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/)
      if (item) {
        if (LABELLED.test(line)) break
        // Struck-out steps are done: "~~Back up~~ done 28 Sep" isn't a next step.
        const step = item[1].replace(/~~[^~]*~~/g, '').trim()
        items.push(step !== '' && !/^done\b/i.test(step) ? step : '')
      } else if (/^\s+\S/.test(line) && items.length > 0) {
        items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`.trim()
      } else {
        break
      }
    }
    for (let k = items.length - 1; k >= 0; k--) if (items[k] === '') items.splice(k, 1)
    if (items.length > 0) return items.map((step, k) => (k < items.length - 1 && !/[.!?;:]$/.test(step) ? `${step};` : step)).join(' ')
  }
  return ''
}

// The section holding the record's current answer: the first titled "Current…" or "Latest…" (records keep older
// checkpoints below with the same heading), otherwise the first section. Only this one gets the accent.
export function currentSectionIndex(titles          )         {
  const i = titles.findIndex(t => /^(?:current|latest)\b/i.test(t.trim()))
  return i === -1 ? 0 : i
}

const CURRENT_TITLE = /^(?:current|latest)\b/i
// A nested heading for older material inside the current section ("### v0.3.0 install record (29 Sep …; superseded
// …)"): the current text ends there, so history kept inside it isn't read as current. A heading counts as history when
// it says so (superseded, history, previous, earlier, older, archive) or carries a date older than the checkpoint's
// own; a dated heading on the same day ("Verified today — 4 October 2026") is still current (Codex V3 review).
const HISTORY_WORDS = /^#{3,}\s+.*(?:supersed|histor|previous|earlier|older|archive)/i
function isHistoryHeading(line        , parentTitle        , nowMs        )          {
  if (!/^#{3,}\s/.test(line)) return false
  if (HISTORY_WORDS.test(line)) return true
  const own = datesIn(line, nowMs)
  const parent = datesIn(parentTitle, nowMs)
  return own.length > 0 && parent.length > 0 && Math.max(...own) < Math.max(...parent)
}
function currentText(body        , parentTitle = '', nowMs = Date.now())         {
  const lines = body.split('\n')
  const end = lines.findIndex(l => isHistoryHeading(l, parentTitle, nowMs))
  return (end === -1 ? lines : lines.slice(0, end)).join('\n')
}

// Where a record's facts may come from. With a current section: the preamble and that section's own text, never an
// older checkpoint. Without one: the whole record, section by section, with a "## Next" heading read as a Next label;
// those facts are undated, and say which section they came from.
                                                                
function factScopes(preamble        , sections           )          {
  const current = sections.find(s => CURRENT_TITLE.test(s.title))
  if (current) {
    return [
      { where: 'preamble', text: preamble, isCurrent: true },
      { where: current.title, text: currentText(current.body, current.title), isCurrent: true },
    ]
  }
  return [
    { where: 'preamble', text: preamble, isCurrent: false },
    ...sections.map(s => ({
      where: s.title,
      text: /^(?:next|read first)\b/i.test(s.title) ? `${s.title.replace(/:$/, '')}:\n${s.body.replace(/^(?!\s)/gm, '  ')}` : s.body,
      isCurrent: false,
    })),
  ]
}

function findLabelled(scopes         , label        )                                                      {
  for (const scope of scopes) {
    const text = labelled(scope.text, label)
    if (text) return { text, where: scope.where, isCurrent: scope.isCurrent }
  }
  return { text: '', where: '', isCurrent: false }
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

  const trimmed = sections.map(s => ({ title: s.title, body: s.body.trim() }))
  const scopes = factScopes(preamble.join('\n').trim(), trimmed)
  const next = findLabelled(scopes, /^next\b/i)
  return {
    path,
    title,
    preamble: preamble.join('\n').trim(),
    sections: trimmed,
    next: next.text,
    nextWhere: next.where,
    readFirst: findLabelled(scopes, /^read first\b/i).text,
  }
}

// ---------- what a record says now: Next, what waits on the owner, who worked on it last, its status ----------

// The owner's first name, from profile.md's "# About <Name>" heading; read at runtime, so no name lives in this file.
export function ownerOf(profile        )         {
  return profile.match(/^# About ([^\s(]+)/m)?.[1] ?? ''
}

const escapeRegExp = (s        ) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Sentences where work waits on the owner: a decision, choice, approval, go-ahead or action that's theirs. A stated
// "Waiting on <owner>:" line is the record's own word; anything else is a keyword match, quoted rather than
// interpreted, and marked as a possible ask.
                                                                                   
function waitPatterns(owner        )               {
  if (!owner) return { stated: null, anywhere: [], inNext: [] }
  const n = escapeRegExp(owner)
  const asks = '(?:decision|choice|approval|go-ahead|review|input|answer|sign-off|confirmation|call)'
  const acts = '(?:decide|choose|pick|approve|confirm|review|start|launch|run|test|check|install|reply|answer|sign off|accept)'
  return {
    stated: new RegExp(`^(?:\\*\\*)?(?:waiting (?:on|for)|needs|decisions? for|questions? for)\\s+${n}\\b[^:]{0,30}:`, 'i'),
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
const NEXT_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*next[^:*]{0,20}:\*\*|\*\*next[^:*]{0,20}\*\*:|next[^:]{0,20}:)\s*(.*)$/i
// A wait that has ended or is only being reported: these sentences are history, not a current ask. "Sentences where
// work waits on Sam" describes a kind of wait rather than making one (found on a real record, 4 Oct).
const NOT_WAITING =
  /\b(?:no longer|not (?:waiting|needed|blocked)|was waiting|were waiting|waited|resolved|withdrawn|superseded)\b|\b(?:where|whenever|when)\s+(?:\w+\s+){0,2}(?:waits?|is waiting)\b/i
// A rule or example rather than an ask: "If blocked until Sam approves, show a message."
const CONDITIONAL = /^(?:\*\*[^*]*\*\*:?\s*)?(?:if|when|whenever|unless|should|in case)\b/i
// A stated wait that says there's nothing to wait for: "Waiting on Sam: none; resolved yesterday."
const STATED_NONE = /:\**\s*(?:none|nothing|n\/a|no\b|not now|resolved|done)\b/i
const QUOTE_LIMIT = 280

// The sentences of some markdown, with list markers, struck-out text and code blocks removed. Hard-wrapped prose (a
// line that carries on from one without a full stop, as some agents write) is joined first, so a sentence isn't cut at
// the line break.
function sentencesOf(md        )           {
  const lines           = []
  let isCode = false
  let canJoin = false
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(raw)) {
      isCode = !isCode
      canJoin = false
      continue
    }
    if (isCode) continue
    const isItem = LIST_ITEM.test(raw) || /^\s*#/.test(raw)
    const line = raw.replace(/~~[^~]*~~/g, ' ').replace(LIST_ITEM, '').replace(/^#+\s+/, '').trim()
    if (line === '' || line.startsWith('|')) {
      canJoin = false
      continue
    }
    if (canJoin && !isItem && !/[.!?]$/.test(lines[lines.length - 1])) lines[lines.length - 1] += ` ${line}`
    else lines.push(line)
    canJoin = !/^\s*#/.test(raw)
  }
  const out           = []
  for (const line of lines) for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z"“(*])/)) if (s.trim()) out.push(s.trim())
  return out
}

function findWaits(md        , where        , patterns              , isNext = false)         {
  if (patterns.anywhere.length === 0) return []
  const out         = []
  for (const s of sentencesOf(md)) {
    let isStated = false
    if (patterns.stated?.test(s)) {
      if (STATED_NONE.test(s)) continue
      isStated = true
    } else {
      // Quoted text ("…", “…”, `…`) is someone else's words or an example, never the record's own ask.
      const bare = s.replace(/"[^"]*"|“[^”]*”|`[^`]*`/g, ' ')
      const usable = isNext || NEXT_LINE.test(s) ? [...patterns.anywhere, ...patterns.inNext] : patterns.anywhere
      if (!usable.some(p => p.test(bare)) || NOT_WAITING.test(bare) || CONDITIONAL.test(bare)) continue
    }
    const text = textOf(s)
    out.push({ text: text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT - 1).trimEnd()}…` : text, where, isStated })
  }
  return out
}

// Claude or Codex, when the text names exactly one of them; Codeg when the work ran inside it.
function providerIn(text        )                                                   {
  const isClaude = /\bClaude\b/i.test(text)
  const isCodex = /\bCodex\b/i.test(text)
  return { provider: isClaude === isCodex ? null : isClaude ? 'claude' : 'codex', viaCodeg: /\bCodeg\b/i.test(text) }
}

// Where a project stands, from what its index row and current checkpoint actually say: a stated pause or hold, or
// words that it's moving. Nothing is assumed from silence: with neither, its status is "not stated".
const PAUSED = /\b(?:paused|on hold|parked|stalled|hold|blocked)\b/i
const MOVING = /\b(?:in progress|in use|active|building|ongoing|under ?way|working on|preparing|running|in development|started|next:)/i
// Active also when the current checkpoint names a next step that isn't conditional ("if the issue is resumed, …").
// Whether a status word is meant: at least one match that isn't negated before it ("not on hold", "no active work",
// "nothing running") or undone after it ("hold lifted"). Found by the Codex V3 review.
const NEGATED_BEFORE = /\b(?:not|no|never|without|nothing|isn't|aren't|wasn't|no longer)\s+(?:\w+\s+)?$/i
const UNDONE_AFTER = /^\s+(?:lifted|released|removed|cleared|resolved|ended|over|undone)\b/i
export function affirms(re        , text        )          {
  const all = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  for (const m of text.matchAll(all)) {
    const at = m.index ?? 0
    const before = text.slice(Math.max(0, at - 24), at)
    const after = text.slice(at + m[0].length, at + m[0].length + 20)
    if (!NEGATED_BEFORE.test(before) && !UNDONE_AFTER.test(after)) return true
  }
  return false
}

export function statusOf(flags        , waits        , said = '', currentNext = '')                {
  if (waits.length > 0) return 'waiting'
  if (flags.includes('done')) return 'done'
  if (flags.includes('blocked') || flags.includes('hold') || affirms(PAUSED, said)) return 'hold'
  return affirms(MOVING, said) || (currentNext !== '' && !CONDITIONAL.test(currentNext)) ? 'active' : 'unstated'
}

// What a record says now. Only current text counts: the index row, the record's Next line, and its section titled
// "Current…" or "Latest…" up to any nested history (none counts when no section is). Older checkpoints and undated
// sections are history; an undated Next is still shown, marked as undated.
export function recordFacts(record        , rowState        , owner        )              {
  const doc = parseDoc('', record)
  const current = doc.sections.find(s => CURRENT_TITLE.test(s.title))
  const currentBody = current ? currentText(current.body, current.title) : ''
  const patterns = waitPatterns(owner)
  const seen = new Set        ()
  const key = (text        ) => text.replace(/^[^:]{0,24}:\s*/, '').toLowerCase()
  const isNextCurrent = Boolean(current) || doc.nextWhere === 'preamble'
  const waits = [
    ...findWaits(rowState, 'index row', patterns),
    ...(current ? findWaits(currentBody, current.title, patterns) : []),
    ...(isNextCurrent ? findWaits(doc.next, 'Next', patterns, true) : []),
  ]
    .filter(w => !seen.has(key(w.text)) && seen.add(key(w.text)))
    // When the record states its waits outright, those are its word: keyword matches elsewhere (often the index row
    // restating the same ask) would only repeat them.
    .filter((w, _, all) => w.isStated || !all.some(o => o.isStated))
  const rowNext = plain(rowState).match(/\bnext:\s*(.+?)\s*$/i)?.[1] ?? ''
  // Who worked on it last: the current heading, else its Updated line; no tag when neither names one provider.
  const fromTitle = providerIn(current?.title ?? '')
  const updated = currentBody.split('\n').find(l => /\*\*Updated:?\*\*/i.test(l)) ?? ''
  const fromUpdated = providerIn(updated)
  const who = fromTitle.provider ? fromTitle : fromUpdated
  const stateLine = labelled(currentBody, /^(?:status|state)\b/i)
  const said = `${plain(rowState)}\n${stateLine}`
  const flags = FLAGS.filter(f => affirms(f.test, plain(rowState))).map(f => f.flag)
  return {
    next: doc.next || rowNext,
    nextWhere: doc.next ? doc.nextWhere : rowNext ? 'index row' : '',
    isNextCurrent: doc.next ? isNextCurrent : Boolean(rowNext),
    readFirst: doc.readFirst,
    waits,
    provider: who.provider,
    viaCodeg: fromTitle.viaCodeg || fromUpdated.viaCodeg,
    status: statusOf(flags, waits, said, doc.next && isNextCurrent ? doc.next : ''),
    stateLine,
    currentTitle: current?.title ?? '',
    ...quotedFallbacks(doc, current?.title ?? '', currentBody),
  }
}

// Without labelled lines, a current checkpoint's own sentence that starts "Next …" or "Read …" stands in, quoted and
// marked as such; it never replaces a labelled line, and nothing outside the current checkpoint is used.
function quotedFallbacks(doc                                     , title        , currentBody        ) {
  const sentences = title ? sentencesOf(currentBody).map(textOf) : []
  const nextQuote = !doc.next ? (sentences.find(s => /^next\s+(?!:)[a-z]/i.test(s)) ?? '') : ''
  // A quoted "Read first: …" sentence loses its own label (the brief already says Read first).
  const readQuote = !doc.readFirst ? (sentences.find(s => /^read\s+(?:first|current|the)\b/i.test(s)) ?? '').replace(/^read first:\s*/i, '') : ''
  return {
    isNextQuoted: nextQuote !== '',
    isReadFirstQuoted: readQuote !== '',
    ...(nextQuote ? { next: nextQuote, nextWhere: title, isNextCurrent: true } : {}),
    ...(readQuote ? { readFirst: readQuote } : {}),
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

// ---------- search across whole records ----------

// A section that has every word searched for (two letters or more each, any order, any case), with an excerpt
// around the first match and the matched spans marked. Current sections rank first, then more matches, then newer.
                         
              
                                                                     
                 
                      
                 
                                                             
                           
                       
               
                                                                          
                    
 
const SNIPPET = 180
export const SEARCH_MAX = 200

function snippetAround(text        , terms          )                                                 {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const first = Math.min(...terms.map(t => lower.indexOf(t)).filter(i => i >= 0))
  let start = Math.max(0, first - 60)
  if (start > 0) start = lower.indexOf(' ', start) + 1 || start
  const end = Math.min(flat.length, start + SNIPPET)
  const lead = start > 0 ? '…' : ''
  const snippet = `${lead}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
  const body = snippet.toLowerCase()
  const marks                     = []
  for (const t of terms) {
    for (let i = body.indexOf(t); i !== -1; i = body.indexOf(t, i + t.length)) marks.push([i, i + t.length])
  }
  marks.sort((a, b) => a[0] - b[0])
  // Overlapping matches (one term inside another) merge into one span.
  const merged                     = []
  for (const m of marks) {
    const last = merged[merged.length - 1]
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1])
    else merged.push([m[0], m[1]])
  }
  return { snippet, marks: merged }
}

// Current sections first, then more matches, then newer.
const byRank = (a           , b           ) =>
  Number(b.isCurrent) - Number(a.isCurrent) || b.score - a.score || (b.dateMs ?? -1) - (a.dateMs ?? -1)

export function searchRecords(texts                        , query        , nowMs = Date.now(), limit = 30)              {
  if (query.length > SEARCH_MAX) return []
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(t => t.length >= 2))]
  if (terms.length === 0) return []
  const hits              = []
  for (const [path, text] of Object.entries(texts)) {
    if (!/^memory\/(?:desktop|laptop)\/projects\/[^/]+\.md$/.test(path) || path.endsWith('/INDEX.md')) continue
    const doc = parseDoc(path, text)
    const parts = [{ index: -1, title: doc.title, body: doc.preamble }, ...doc.sections.map((s, index) => ({ index, title: s.title, body: s.body }))]
    const found              = []
    for (const part of parts) {
      const plainText = textOf(`${part.title}\n${part.body}`)
      const hay = plainText.toLowerCase()
      if (!terms.every(t => hay.includes(t))) continue
      const count = terms.reduce((n, t) => n + hay.split(t).length - 1, 0)
      const dates = datesIn(part.title, nowMs)
      // The excerpt comes from the body, or from heading and body when only the heading matched.
      const fromBody = snippetAround(textOf(part.body), terms)
      const { snippet, marks } = fromBody.marks.length > 0 ? fromBody : snippetAround(plainText, terms)
      const isCurrent = CURRENT_TITLE.test(part.title)
      found.push({
        path,
        section: part.index,
        sectionTitle: part.index === -1 ? 'Top of the record' : part.title,
        snippet,
        marks,
        dateMs: dates.length > 0 ? Math.max(...dates) : null,
        score: count,
        isCurrent,
      })
    }
    hits.push(...found.sort(byRank).slice(0, 3))
  }
  return hits.sort(byRank).slice(0, limit)
}

// ---------- sharing to Claude (or any app): a prepared prompt around exact quoted text ----------

// What leaves the hub when the owner shares a section or an idea: a short instruction, where the text came from, and the
// text itself, verbatim. Nothing is run or saved here; the app he picks does the rest. The instructions carry the
// hub's rules: only the quoted text, unknowns said as unknown, no invented numbers, quotes for facts.
                                                     
                          
                 
                 
                  
                                           
                 
              
              
                   
                   
 
export const SHARE_LIMIT = 12_000

export function sharePrompt(input            , nowMs        )                                                  {
  const isCut = input.text.length > SHARE_LIMIT
  const quoted = isCut ? `${input.text.slice(0, SHARE_LIMIT)}\n[… cut here: the rest is in the file named above]` : input.text
  const when = new Date(nowMs)
  const stamp = `${when.getDate()} ${MON[when.getMonth()]} ${when.getFullYear()} ${pad(when.getHours())}:${pad(when.getMinutes())}`
  const machine = input.machine ? `${input.machine[0].toUpperCase()}${input.machine.slice(1)} record, file` : 'File'
  const from =
    input.kind === 'develop'
      ? `Idea${input.captured ? ` (captured ${input.captured})` : ''}: "${input.section}", file ${input.path}, as shown in my projects hub on ${stamp}.`
      : `From: ${input.project || input.path} — "${input.section}"\n${machine} ${input.path}, as shown in my projects hub on ${stamp}.`
  const rules = "If the text doesn't say something, call it unknown rather than guessing, and don't invent numbers."
  const ask =
    input.kind === 'explain'
      ? [
          'Please explain this part of my project notes in plain English, briefly.',
          '- Say what it means and where the work stands, using only the text below.',
          '- Define any jargon or abbreviations the first time they come up.',
          `- ${rules}`,
          "- Quote the line you're relying on for each fact.",
        ]
      : input.kind === 'ask'
        ? [
            'Answer my question using only the text below from my project notes.',
            `- Quote the lines you rely on. ${rules}`,
            '',
            `Question: ${(input.question ?? '').trim() || '(type your question here)'}`,
          ]
        : [
            'Help me turn this idea into a first small experiment I could try.',
            '- Give the smallest useful version, the questions to answer first, the first three steps, and the risks or costs.',
            "- Keep your suggestions clearly separate from what the idea itself says.",
            `- ${rules}`,
          ]
  const title = input.kind === 'explain' ? `Explain: ${input.section}` : input.kind === 'ask' ? `Question about: ${input.section}` : `Develop: ${input.section}`
  return { title: title.slice(0, 120), text: `${ask.join('\n')}\n\n${from}\n\n"""\n${quoted}\n"""\n`, isCut }
}

// ---------- glossary: short meanings for recurring terms, explained on tap ----------

// memory/desktop/hub/glossary.md, written by the owner or an agent (curated, never generated). One entry per list item:
//   - **TERM** (optional scope) — meaning. Source: path/of/the/record/that/defines/it.md
// The scope says where a term means this (a project reusing an acronym); the source is where the meaning comes from.
                                                                                            
export const GLOSSARY_PATH = 'memory/desktop/hub/glossary.md'

export function parseGlossary(md        )                  {
  const out                  = []
  for (const line of md.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^\s*[-*]\s+\*\*([^*]{1,40})\*\*\s*(?:\(([^)]{1,60})\))?\s*[—–-]\s*(.+)$/)
    if (!m) continue
    const [meaning, source = ''] = m[3].split(/\s*Source\s*:\s*/i)
    if (meaning.trim()) out.push({ term: m[1].trim(), scope: (m[2] ?? '').trim(), meaning: textOf(meaning.trim()), source: source.trim() })
  }
  return out
}

// ---------- usage: readings of each account's rate-limit windows, never estimates ----------

// Three accounts: Claude on each machine (separate accounts) and one Codex account used on both.
                                                                       
export const USAGE_ACCOUNTS                                                           = [
  { account: 'claude-desktop', label: 'Claude · desktop account', none: "No reading yet: one appears after a Claude Code reply on the desktop." },
  { account: 'claude-laptop', label: 'Claude · laptop account', none: "No reading: the laptop doesn't publish usage yet." },
  { account: 'codex', label: 'Codex', none: 'No reading yet: one appears after Codex works on a machine that publishes usage.' },
]
                                                                                                                        
// What one source said at one moment: `observedAtMs` is when the provider reported it, not when it was copied.
                                                                                                                   
                                                                                                           

const isPercent = (n         )              => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000
const windowName = (minutes               ) =>
  minutes === null ? 'window' : minutes === 10080 ? 'weekly' : minutes < 1440 ? `${Math.round(minutes / 60)}-hour` : `${Math.round(minutes / 1440)}-day`

// Claude Code's rate-limit windows (a mod's `$.session.usage()` or `session.measure`), as of its last reply.
const CLAUDE_WINDOWS                                                    = {
  five_hour: { name: '5-hour', minutes: 300 },
  seven_day: { name: '7-day', minutes: 10080 },
}
export function claudeUsageReading(
  limits                                                            ,
  machine         ,
  observedAtMs        ,
)                      {
  const windows = limits
    .filter(l => typeof l?.kind === 'string' && isPercent(l.percentUsed))
    .map(l => {
      const known = CLAUDE_WINDOWS[l.kind]
      const resets = l.resetsAt ? Date.parse(l.resetsAt) : Number.NaN
      return {
        name: known?.name ?? l.kind.replace(/_/g, ' '),
        usedPercent: l.percentUsed,
        windowMinutes: known?.minutes ?? null,
        resetsAtMs: Number.isFinite(resets) ? resets : null,
      }
    })
  return windows.length > 0 ? { account: machine === 'laptop' ? 'claude-laptop' : 'claude-desktop', origin: machine, observedAtMs, windows } : null
}

// Codex's session logs (rollout-*.jsonl) carry `rate_limits` with each token count: an internal format, read by this
// adapter only (version 1, checked against real logs on 4 Oct 2026). The newest line that parses and has a valid
// window wins; anything cut off, unknown or empty is skipped, and no valid line at all means no reading.
export const CODEX_ADAPTER = 'rollout-token_count-v1'
export function codexUsageFromLog(text        , origin         )                      {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"rate_limits"')) continue
    let entry                                                                                                                  
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    const limits = entry.payload?.type === 'token_count' ? entry.payload.rate_limits : null
    const observedAtMs = Date.parse(entry.timestamp ?? '')
    if (!limits || !Number.isFinite(observedAtMs)) continue
    const windows                = []
    for (const key of ['primary', 'secondary']) {
      const w = limits[key]                                                                                                
      if (!w || !isPercent(w.used_percent)) continue
      const minutes = typeof w.window_minutes === 'number' && w.window_minutes > 0 ? w.window_minutes : null
      const resets = typeof w.resets_at === 'number' && w.resets_at > 0 ? (w.resets_at < 1e12 ? w.resets_at * 1000 : w.resets_at) : null
      windows.push({ name: windowName(minutes), usedPercent: w.used_percent, windowMinutes: minutes, resetsAtMs: resets })
    }
    if (windows.length > 0) return { account: 'codex', origin, observedAtMs, windows }
  }
  return null
}

// The published file, memory/<machine>/hub/usage.md: a short note and a JSON block (sync.sh only publishes .md files).
export function usageSnapshotMarkdown(s               )         {
  return (
    `# Usage readings (${s.machine})\n\n` +
    'Written by the profile-sync mod on this machine and read by the projects hub. These are readings as each provider ' +
    'last reported them, with the time observed; nothing here is estimated. No prompts, sessions or account details.\n\n' +
    `\`\`\`json\n${JSON.stringify(s, null, 1)}\n\`\`\`\n`
  )
}

const isReading = (r         )                    => {
  const x = r                
  return (
    typeof x === 'object' && x !== null &&
    USAGE_ACCOUNTS.some(a => a.account === x.account) &&
    (x.origin === 'desktop' || x.origin === 'laptop') &&
    Number.isFinite(x.observedAtMs) &&
    Array.isArray(x.windows) &&
    x.windows.every(
      w =>
        typeof w?.name === 'string' &&
        isPercent(w.usedPercent) &&
        (w.resetsAtMs === null || (typeof w.resetsAtMs === 'number' && Number.isFinite(w.resetsAtMs))) &&
        (w.windowMinutes === null || (typeof w.windowMinutes === 'number' && w.windowMinutes > 0)),
    )
  )
}
export function parseUsageSnapshot(md        )                       {
  const block = md.match(/```json\s*\n([\s\S]*?)\n```/)?.[1]
  if (!block) return null
  try {
    const s = JSON.parse(block)                 
    if (s?.version !== 1 || (s.machine !== 'desktop' && s.machine !== 'laptop') || !Array.isArray(s.readings)) return null
    return { ...s, readings: s.readings.filter(isReading) }
  } catch {
    return null
  }
}

// One row per account, from the newest reading of it (by when the provider reported it, whichever machine it came
// from). A window whose reset time has passed since that reading is "reset-passed": its use since then is unknown,
// so no percentage is shown for it.
                        
                       
               
              
                              
                                                                                              
 
export function usageRows(readings                , nowMs        )             {
  return USAGE_ACCOUNTS.map(({ account, label, none }) => {
    const reading = readings.filter(r => r.account === account).sort((a, b) => b.observedAtMs - a.observedAtMs)[0] ?? null
    const windows = (reading?.windows ?? []).map(w =>
      w.resetsAtMs !== null && w.resetsAtMs <= nowMs ? { ...w, state: 'reset-passed'         , usedPercent: null } : { ...w, state: 'reading'          },
    )
    return { account, label, none, reading, windows }
  })
}

// ---------- chart ----------

const esc = (s        ) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n1 = (n        ) => n.toFixed(1)

// Class names are prefixed, since the SVG may sit inline in a page with its own styles.
const CHART_CSS =
  '.hub-d{fill:#2a78d6}.hub-l{fill:#eb6834}.hub-base{stroke:#c3c2b7;stroke-width:1}.hub-hit{fill:transparent}' +
  '.hub-col:hover .hub-hit{fill:rgba(137,135,129,.14)}.hub-lbl{fill:#898781;font:10px system-ui,sans-serif}.hub-now,.hub-val{font-weight:700}' +
  '@media (prefers-color-scheme: dark){.hub-d{fill:#3987e5}.hub-l{fill:#d95926}.hub-base{stroke:#383835}}'

function topRounded(x        , y        , w        , h        , cls        )         {
  const r = Math.min(4, w / 2, h)
  return (
    `<path class="${cls}" d="M${n1(x)} ${n1(y + h)}V${n1(y + r)}Q${n1(x)} ${n1(y)} ${n1(x + r)} ${n1(y)}` +
    `H${n1(x + w - r)}Q${n1(x + w)} ${n1(y)} ${n1(x + w)} ${n1(y + r)}V${n1(y + h)}Z"/>`
  )
}

// Records updated on each of the last 14 days, by machine: a record counts once on each day a commit changed it.
// (Each machine only writes its own records, so the record's machine is the one that updated it.)
                                                                              
export function activityDays(list           , nowMs        )                {
  const today = todayKey(nowMs)
  const cols                = Array.from({ length: CHART_DAYS }, (_, i) => ({ day: today - (CHART_DAYS - 1 - i) * DAY_MS, desktop: [], laptop: [] }))
  for (const p of list) {
    for (const day of p.updatedDays ?? []) cols.find(c => c.day === day)?.[p.machine].push(p.name)
  }
  return cols
}

// The same as a stacked column chart, with each day's count over its column and the names in its tooltip.
export function activityChart(list           , nowMs        , width        ) {
  const cols = activityDays(list, nowMs)
  const height = 86
  const base = 70
  const top = 14
  const slot = width / CHART_DAYS
  const barW = Math.max(4, Math.min(18, slot - 6))
  const max = Math.max(3, ...cols.map(c => c.desktop.length + c.laptop.length))
  const unit = (base - top) / max
  const parts           = []
  const alt           = []
  const total = list.filter(p => (p.updatedDays ?? []).some(d => cols[0].day <= d)).length

  cols.forEach((c, i) => {
    const x = i * slot + (slot - barW) / 2
    const hD = c.desktop.length * unit
    const hL = c.laptop.length * unit
    const count = c.desktop.length + c.laptop.length
    const label = fmtDay(c.day)
    const names = [...c.desktop.map(n => `${n} (desktop)`), ...c.laptop.map(n => `${n} (laptop)`)]
    const tip =
      names.length === 0
        ? `${label}: no records updated`
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
    if (count > 0) {
      g += `<text class="hub-lbl hub-val" x="${n1(i * slot + slot / 2)}" y="${n1(base - hD - hL - (hD > 0 && hL > 0 ? 2 : 0) - 3)}" text-anchor="middle">${count}</text>`
    }
    if (slot >= 16 || i % 2 === (CHART_DAYS - 1) % 2) {
      const cls = i === CHART_DAYS - 1 ? 'hub-lbl hub-now' : 'hub-lbl'
      g += `<text class="${cls}" x="${n1(i * slot + slot / 2)}" y="${height - 3}" text-anchor="middle">${new Date(c.day).getUTCDate()}</text>`
    }
    parts.push(`${g}</g>`)
    if (names.length > 0) alt.push(`${label}: ${c.desktop.length} desktop, ${c.laptop.length} laptop`)
  })

  const title = `Records updated per day, last ${CHART_DAYS} days`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${height}" viewBox="0 0 ${n1(width)} ${height}" role="img" aria-label="${esc(`${title}. ${alt.join('; ') || 'None.'}`)}">` +
    `<style>${CHART_CSS}</style><line class="hub-base" x1="0" x2="${n1(width)}" y1="${base + 0.5}" y2="${base + 0.5}"/>` +
    `${parts.join('')}</svg>`
  return { source, alt: `${title}. ${alt.join('; ') || 'None.'}`, width, height, total }
}

// The same days as text, for surfaces that can't follow the page's theme in an SVG (the pane): one row of block
// characters per machine, scaled to the busiest day, and the count for each row.
const BLOCKS = ' ▁▂▃▄▅▆▇█'
export function activitySparks(list           , nowMs        )                                                      {
  const cols = activityDays(list, nowMs)
  const max = Math.max(1, ...cols.map(c => Math.max(c.desktop.length, c.laptop.length)))
  return MACHINES.map(machine => ({
    machine,
    bars: cols.map(c => (c[machine].length === 0 ? '·' : BLOCKS[Math.max(1, Math.round((c[machine].length / max) * 8))])).join(''),
    count: new Set(cols.flatMap(c => c[machine])).size,
  }))
}
