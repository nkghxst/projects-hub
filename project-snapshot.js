// XS v1: observations of checkpoint records, not commands or runtime/session outcomes.
import { buildProject, currentMetadataText, metadataLines, parseDoc, parseIndexRows, sectionHash } from './core.js'
                                                           

export const SNAPSHOT_MACHINES            = ['desktop', 'laptop']
export const snapshotPath = (machine         ) => `memory/${machine}/hub/projects-snapshot.md`
const DAY = 86400000
const SKEW = 5 * 60000
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const RECORD = /^memory\/(desktop|laptop)\/projects\/([a-z0-9][a-z0-9-]{0,79})\.md$/
const STATES = ['active', 'hold', 'done', 'waiting', 'unstated']
// Same metadata positions as recordFolders: line start, either list marker, or a
// middle-dot field separator. Collect first, then validate AND select from that
// same collection, so no accepted owner/ID field can bypass conflict detection.
const SNAPSHOT_FIELD = /(?:^[ \t]*(?:[-*][ \t]+)?|[ \t]·[ \t])\*\*\s*(project id|development owner)\s*:\s*\*\*([^\n]*?)(?=[ \t]·[ \t]|\*\*|$)/gim
                           
            
                
                      
                   
                    
                                
                                                                   
                            
 
// Fixed source identifiers resolve via the existing project record, never executable paths.
                                                                                                                                                                                  
                                                                                                           
                                                                                                            
                                                                                                                 
                            
                                                                               
                                                      
                                                                    
 
                              
                                                                                             
                                            
 

const object = (v         )                           => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v                     , keys          ) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const time = (v         )              => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000

export function parseProjectSnapshot(text                           , machine         )               {
  if (text == null) return { status: 'missing', snapshot: null }
  const bad               = { status: 'invalid', snapshot: null }
  if (text.length > 512000) return bad
  const match = text.match(/^# Projects snapshot v1\r?\n\r?\n```json\r?\n([\s\S]+)\r?\n```\s*$/)
  if (!match) return bad
  try {
    const s = JSON.parse(match[1])
    if (!object(s) || !exact(s, ['version', 'machine', 'observedAt', 'projects']) || s.version !== 1 || s.machine !== machine || !time(s.observedAt) || !Array.isArray(s.projects) || s.projects.length > 500) return bad
    const ids = new Set        ()
    const paths = new Set        ()
    for (const p of s.projects) {
      if (!object(p) || !exact(p, ['id', 'owner', 'state', 'needsYou', 'observedAt', 'sourceUpdatedAt', 'source', ...(Object.hasOwn(p, 'evidence') ? ['evidence'] : [])]) || typeof p.id !== 'string' || !ID.test(p.id) || ids.has(p.id) || p.owner !== machine || !STATES.includes(p.state) || typeof p.needsYou !== 'boolean' || !time(p.observedAt) || p.observedAt !== s.observedAt || !(p.sourceUpdatedAt === null || time(p.sourceUpdatedAt))) return bad
      if (p.evidence !== undefined) {
        if (p.id !== 'music-atlas' || machine !== 'desktop' || !Array.isArray(p.evidence) || p.evidence.length > 3) return bad
        const refs = new Set        ()
        for (const e of p.evidence) {
          if (!object(e) || !exact(e, ['ref', 'observedAt', 'updatedAt', 'head', 'dirty']) || !['atlas-parent', 'atlas-site', 'atlas-coordinator'].includes(e.ref) || refs.has(e.ref) || e.observedAt !== s.observedAt || !(e.updatedAt === null || time(e.updatedAt)) || !(e.head === null || (typeof e.head === 'string' && /^[a-f0-9]{40,64}$/.test(e.head))) || !(e.dirty === null || typeof e.dirty === 'boolean') || (e.ref === 'atlas-coordinator' && (e.head !== null || e.dirty !== null))) return bad
          refs.add(e.ref)
        }
      }
      const src = p.source
      if (!object(src) || !exact(src, ['kind', 'path', 'fingerprint']) || src.kind !== 'checkpoint' || typeof src.path !== 'string' || RECORD.exec(src.path)?.[1] !== machine || paths.has(src.path) || typeof src.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(src.fingerprint)) return bad
      ids.add(p.id); paths.add(src.path)
    }
    return { status: 'available', snapshot: s }
  } catch { return bad }
}

export function projectSnapshotMarkdown(snapshot                 )         {
  const text = `# Projects snapshot v1\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n`
  if (parseProjectSnapshot(text, snapshot.machine).status !== 'available') throw new Error('Invalid project snapshot')
  return text
}

// Only an explicitly dated Current/Latest heading. No filesystem mtime, sync date,
// historical maximum, inferred year, or future date hidden by the older date parser.
function checkpointDate(text        )                {
  const heading = parseDoc('', text).sections.find(s => /^(current|latest)\b/i.test(s.title))?.title ?? ''
  const m = heading.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  const words = heading.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i)
  if (!m && !words) return null
  const year = Number(m ? m[1] : words [3])
  const month = m ? Number(m[2]) - 1 : ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(words [2].slice(0, 3).toLowerCase())
  const day = Number(m ? m[3] : words [1])
  const t = Date.UTC(year, month, day), d = new Date(t)
  return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day ? t : null
}

export async function snapshotInventory(texts                        , now        , person = '')                             {
  const out                    = []
  for (const machine of SNAPSHOT_MACHINES) {
    for (const row of parseIndexRows(texts[`memory/${machine}/projects/INDEX.md`] ?? '')) {
      const path = `memory/${machine}/projects/${row.fileName}`
      const match = RECORD.exec(path)
      if (!match) continue
      const text = texts[path]
      const meta = currentMetadataText(parseDoc(path, text ?? ''))
      const lines = metadataLines(meta)
      const fields = [...lines.matchAll(SNAPSHOT_FIELD)].map(m => ({ name: m[1].toLowerCase(), value: m[2].trim() }))
      const explicit = fields.filter(f => f.name === 'project id').map(f => f.value)
      const owners = fields.filter(f => f.name === 'development owner').map(f => f.value.match(/^(desktop|laptop)\b/i)?.[1].toLowerCase() ?? 'invalid')
      const declaredOwner                 = owners[0] === 'desktop' || owners[0] === 'laptop' ? owners[0] : null
      const facts = buildProject(machine, row, text ?? '', undefined, now, 0, { owner: person })
      const id = explicit[0] ?? match[2]
      out.push({ id, owner: declaredOwner ?? machine, declaredOwner, available: typeof text === 'string',
        issue: !ID.test(id) || explicit.length > 1 || owners.includes('invalid') || new Set(owners).size > 1,
        state: facts.status, needsYou: facts.waits.some(w => w.isStated), observedAt: now,
        sourceUpdatedAt: checkpointDate(text ?? ''),
        source: { kind: 'checkpoint', path, fingerprint: await sectionHash(JSON.stringify([row, text ?? null])) } })
    }
  }
  return out
}

function ownership(records                   )                 {
  if (records.some(r => r.issue) || SNAPSHOT_MACHINES.some(m => records.filter(r => RECORD.exec(r.source.path)?.[1] === m).length > 1)) return null
  const explicit = [...new Set(records.map(r => r.declaredOwner).filter(Boolean))]
  return explicit.length === 1 ? explicit[0]  : explicit.length === 0 && records.length === 1 ? records[0].owner : null
}

export function produceProjectSnapshot(machine         , records                   , now        )                  {
  const projects                = []
  for (const id of new Set(records.map(r => r.id))) {
    const group = records.filter(r => r.id === id)
    if (ownership(group) !== machine) continue
    const r = group.find(r => RECORD.exec(r.source.path)?.[1] === machine)
    if (!r?.available) continue
    const { declaredOwner, available, issue, ...observation } = r
    projects.push({ ...observation, owner: machine, observedAt: now })
  }
  return { version: 1, machine, observedAt: now, projects }
}

export function reconcileProjectSnapshots(records                   , reads                               , now        )                 {
  const projects                 = []
  for (const id of new Set(records.map(r => r.id))) {
    const group = records.filter(r => r.id === id)
    const owner = ownership(group)
    const view               = { id, owner, freshness: 'unknown', observationFreshness: 'unknown', reason: '', observation: null, records: group.map(r => r.source.path) }
    projects.push(view)
    if (!owner) { view.reason = 'Ownership or project ID conflict'; continue }
    const read = reads[owner]
    if (read.status !== 'available') { view.reason = `${owner} snapshot ${read.status}`; continue }
    const candidates = SNAPSHOT_MACHINES.flatMap(m => reads[m].snapshot?.projects.filter(p => p.id === id) ?? [])
    if (candidates.some(p => p.owner !== owner)) { view.reason = 'Ownership changed or conflicting snapshots'; continue }
    const p = candidates.find(p => p.owner === owner)
    if (!p) { view.reason = 'No owner observation'; continue }
    view.observation = p
    const r = group.find(r => r.source.path === p.source.path)
    if (!r?.available) { view.reason = 'Source missing in this copy'; continue }
    if (r.source.fingerprint !== p.source.fingerprint || r.state !== p.state || r.needsYou !== p.needsYou || r.sourceUpdatedAt !== p.sourceUpdatedAt) { view.reason = 'Snapshot and record differ; sync or refresh needed'; continue }
    if (p.observedAt > now + SKEW || (p.sourceUpdatedAt !== null && (p.sourceUpdatedAt > now + SKEW || p.sourceUpdatedAt > p.observedAt + SKEW))) { view.reason = 'Clock discrepancy'; continue }
    view.observationFreshness = now - p.observedAt > 2 * DAY ? 'stale' : 'recent'
    if (p.sourceUpdatedAt === null) { view.reason = 'Source update date unknown'; continue }
    view.freshness = now - p.observedAt > 2 * DAY || now - p.sourceUpdatedAt >= 7 * DAY ? 'stale' : 'current'
    view.reason = view.freshness === 'current' ? 'Checkpoint evidence within 7 days; observed within 2 days' : now - p.observedAt > 2 * DAY ? 'Observation older than 2 days' : 'Source checkpoint at least 7 days old'
  }
  const ids = new Set(records.map(r => r.id))
  return { projects, machines: SNAPSHOT_MACHINES.map(machine => ({ machine, status: reads[machine].status, observedAt: reads[machine].snapshot?.observedAt ?? null })),
    orphaned: SNAPSHOT_MACHINES.reduce((n, m) => n + (reads[m].snapshot?.projects.filter(p => !ids.has(p.id)).length ?? 0), 0) }
}

export async function sharedProjectsFrom(texts                        , snapshots                                         , now        , person = '')                          {
  const records = await snapshotInventory(texts, now, person)
  const result = reconcileProjectSnapshots(records, { desktop: parseProjectSnapshot(snapshots.desktop, 'desktop'), laptop: parseProjectSnapshot(snapshots.laptop, 'laptop') }, now)
  if (SNAPSHOT_MACHINES.some(m => typeof texts[`memory/${m}/projects/INDEX.md`] !== 'string')) {
    for (const p of result.projects) { p.owner = null; p.freshness = 'unknown'; p.observationFreshness = 'unknown'; p.reason = 'Project index missing; ownership cannot be reconciled' }
  }
  return result
}
