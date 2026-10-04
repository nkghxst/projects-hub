// What this device last saw of each record: the fingerprint of every section (by title), so the home can mark records
// that changed since they were last opened, and a record can mark which of its sections changed. Kept per device.
// The first time the app runs, everything counts as already seen, so marks start from then.
                                        
import { readJson } from './state.js'

                                                                                   
const KEY = 'hub.seen'

const read = () => readJson             (KEY, null)
function write(seen      ) {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {
    // Storage full: marks just won't move on until there's room.
  }
}

function changedTitles(before                        , now                        )              {
  return new Set(Object.keys(now).filter(t => before[t] !== now[t]))
}

export function initSeen(projects           ) {
  if (read()) return
  write({ baselineAt: Date.now(), records: Object.fromEntries(projects.filter(p => p.file && p.prints).map(p => [p.file, p.prints])) })
}

// 'changed': a section is new or different since this device last opened it; 'new': the record appeared since then.
export function changeOf(p                                  )                             {
  const seen = read()
  if (!seen || !p.file || !p.prints) return 'none'
  const before = seen.records[p.file]
  if (!before) return 'new'
  return changedTitles(before, p.prints).size > 0 ? 'changed' : 'none'
}

// Opening a record: the sections that changed since last time (none for a record never opened before), and from now
// on it counts as seen.
export function openRecord(p                                  )              {
  const seen = read() ?? { baselineAt: Date.now(), records: {} }
  const before = seen.records[p.file]
  const changed = before ? changedTitles(before, p.prints) : new Set        ()
  seen.records[p.file] = p.prints
  write(seen)
  return changed
}
