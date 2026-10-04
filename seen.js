// What this device last saw of each record: the fingerprint of every part of it (sectionPrints), so the home can mark
// records that changed since they were last opened, and a record can mark which of its sections changed or went.
// Kept per device and per repository. The first time the project list loads, everything counts as already seen, so
// marks start from then.
                                        
import { readJson, state } from './state.js'

                                    
                                                                    

const key = () => `hub.seen.${state.source?.dest ?? 'local'}`
const read = () => readJson             (key(), null)
function write(seen      ) {
  try {
    localStorage.setItem(key(), JSON.stringify(seen))
  } catch {
    // Storage full: marks just won't move on until there's room.
  }
}

// Every part that's new, different or gone, comparing both sides (a removed section counts too).
export function diffPrints(before        , now        )                                              {
  const changed = new Set(Object.keys(now).filter(t => before[t] !== now[t]))
  const removed = Object.keys(before).filter(t => !(t in now))
  return { changed, removed }
}

export function initSeen(projects                                    ) {
  const seen = read() ?? { records: {} }
  if (seen.baselineAt) return
  for (const p of projects) if (p.file && p.prints && !seen.records[p.file]) seen.records[p.file] = p.prints
  seen.baselineAt = Date.now()
  write(seen)
}

// 'changed': a part is new, different or gone since this device last opened it; 'new': the record appeared since.
export function changeOf(p                                  )                             {
  const seen = read()
  if (!seen?.baselineAt || !p.file || !p.prints) return 'none'
  const before = seen.records[p.file]
  if (!before) return 'new'
  const { changed, removed } = diffPrints(before, p.prints)
  return changed.size > 0 || removed.length > 0 ? 'changed' : 'none'
}

// What this device last saw of a record (null if never), and remembering a version as seen.
export const seenPrints = (file        )                => read()?.records[file] ?? null
export function markSeen(file        , prints        ) {
  const seen = read() ?? { records: {} }
  seen.records[file] = prints
  write(seen)
}

// Opening a record with these prints: the sections that changed since last time (none for a record never opened
// before), and from now on this version counts as seen.
export function openRecord(p                                  )              {
  const before = seenPrints(p.file)
  markSeen(p.file, p.prints)
  return before ? diffPrints(before, p.prints).changed : new Set        ()
}
