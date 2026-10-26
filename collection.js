// Presentation preferences only. Never write source records, notes or the profile.
                                        
                                       
import { COLOURS, ICONS } from './project-art.js'
export { COLOURS, ICONS, projectArt } from './project-art.js'

                                                                                      
                                                                                                                                                                                                                                              
const PREFIX = 'hub.collection.v1.'
const slot = (kind        , dest        , key = '') => `${PREFIX}${kind}:${JSON.stringify([dest, key])}`
const object = (v         )                               => !!v && typeof v === 'object' && !Array.isArray(v)
const string = (v         , max        )              => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
const coverId = (v         )              => typeof v === 'string' && /^cover:[a-f0-9-]{36}$/.test(v)

// Reconciled IDs win only when their ownership and membership are unambiguous.
// A conflict must not join records through pairFile as a side door.
export function projectKey(project         , shared                         )         {
  const projects = shared?.projects ?? []
  const matches = projects.filter(v => v.records.includes(project.file))
  const pairMatches = project.pairFile ? projects.filter(v => v.records.includes(project.pairFile)) : []
  if (matches.length || pairMatches.length) {
    const view = matches[0]
    if (matches.length === 1 && view.owner && /^[a-z0-9][a-z0-9-]{0,79}$/.test(view.id)
      && projects.filter(v => v.id === view.id).length === 1
      && view.records.every(path => projects.filter(v => v.records.includes(path)).length === 1)
      && (!project.pairFile || (pairMatches.length === 1 && pairMatches[0] === view))) return `id:${view.id}`
    return `record:${project.file}`
  }
  return project.pairFile && project.pairFile !== project.file ? `pair:${JSON.stringify([project.file, project.pairFile].sort())}` : `record:${project.file}`
}
function defaults(key        )           {
  let hash = 2166136261
  for (const ch of key) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0
  hash = (hash ^ (hash >>> 13)) >>> 0
  return { icon: ICONS[hash % ICONS.length], colour: COLOURS[Math.floor(hash / ICONS.length) % COLOURS.length], group: '' }
}
function identity(v         )                       {
  if (!object(v) || !ICONS.some(i => i === v.icon) || !COLOURS.some(c => c === v.colour) || !string(v.group, 80) || (v.cover !== undefined && !coverId(v.cover))) return
  return { icon: v.icon          , colour: v.colour          , group: v.group, ...(v.cover ? { cover: v.cover           } : {}) }
}
function read(kind        , dest        , key = '')          {
  try {
    const raw = localStorage.getItem(slot(kind, dest, key))
    if (!raw || raw.length > 256000) return
    const parsed = JSON.parse(raw)
    if (object(parsed) && parsed.version === 1) return parsed.value
  } catch { /* blocked/corrupt reads have safe defaults; writes report their failure */ }
}
function write(kind        , dest        , value         , key = '')       {
  const serialized = JSON.stringify({ version: 1, value })
  if (serialized.length > 256000) throw new Error('Collection preference storage limit exceeded')
  localStorage.setItem(slot(kind, dest, key), serialized)
}
export function readIdentity(dest        , key        )           { return identity(read('identity', dest, key)) ?? defaults(key) }
export function saveIdentity(dest        , key        , value          )       {
  const checked = identity(value)
  if (!checked) throw new Error('Choose a built-in icon, colour and a group of at most 80 characters')
  write('identity', dest, checked, key)
}
// Delete bytes separately with deleteCover if the identity had a cover.
export function removeIdentity(dest        , key        )       { localStorage.removeItem(slot('identity', dest, key)) }
function view(v         )                      {
  return object(v) && string(v.name, 80) && !!v.name.trim() && string(v.query, 500)
    && ['all', 'desktop', 'laptop'].includes(v.machine          ) && ['all', 'waiting', 'changed', 'pinned', 'recent'].includes(v.filter          )
    && typeof v.grouped === 'boolean' && typeof v.compact === 'boolean' && (v.sort === undefined || ['checkpoint','edited','index'].includes(v.sort          ))
}
function views(v         )                               {
  if (!Array.isArray(v) || v.length > 30 || !v.every(view)) return
  return v.map(({ name, query, machine, filter, grouped, compact, sort }) => ({ name, query, machine, filter, grouped, compact, ...(sort ? { sort } : {}) }))
}
export function readLayout(dest        )                             { const value = read('layout', dest); return view(value) ? value : undefined }
export function saveLayout(dest        , value                )       { if (!view(value)) throw new Error('Invalid collection layout'); write('layout', dest, value) }
// Reset all known destinations before the app removes localStorage, including orphan cover bytes.
export async function resetAllCollections()                {
  if (!('indexedDB' in globalThis)) return
  const destinations = new Set        ()
  for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i); if(key?.startsWith(PREFIX)) { try { destinations.add(JSON.parse(key.slice(key.indexOf(':')+1))[0]) } catch {} } }
  for (const dest of destinations) await resetCollection(dest)
  const db = await database()
  await new Promise      ((resolve,reject)=> { const tx=db.transaction('covers','readwrite'); tx.objectStore('covers').clear(); tx.oncomplete=()=>{db.close();resolve()}; tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Collection cover storage could not be cleared'))} })
}
export function readViews(dest        )                   { return views(read('views', dest)) ?? [] }
export function saveViews(dest        , value                  )       {
  const checked = views(value)
  if (!checked) throw new Error('Saved views must have valid filters and names (maximum 30 views)')
  write('views', dest, checked)
}
const time = (v         )              => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000
export function readVisits(dest        )                         {
  const value = read('visits', dest)
  if (!object(value) || Object.keys(value).length > 2000 || !Object.entries(value).every(([k, v]) => k.length <= 1000 && time(v))) return {}
  return Object.fromEntries(Object.entries(value))
}
export function recordVisit(dest        , key        , atMs        )       {
  if (!string(key, 1000) || !time(atMs)) throw new Error('Invalid project visit')
  const old = readVisits(dest)
  const value = { ...old, [key]: Math.max(Object.hasOwn(old, key) ? old[key] : 0, atMs) }
  write('visits', dest, Object.fromEntries(Object.entries(value).sort((a, b) => b[1] - a[1]).slice(0, 2000)))
}

export const COVER_MAX_BYTES = 256 * 1024
export const COVER_MAX_EDGE = 512
export const collectionEpochKey = (dest        )         => slot('epoch', dest)
export const collectionEpoch = (dest        )         => `${localStorage.getItem('hub.epoch') ?? ''}:${localStorage.getItem(collectionEpochKey(dest)) ?? ''}`
const epoch = collectionEpoch
function unchanged(dest        , before        )       { if (epoch(dest) !== before) throw new Error('Stopped: collection data was reset') }
async function database()                       {
  return new Promise((resolve, reject) => {
    let abandoned = false
    const request = indexedDB.open('hub-collection-covers', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('covers')
    request.onerror = () => { abandoned = true; reject(new Error('Cover storage unavailable')) }
    request.onblocked = () => { abandoned = true; reject(new Error('Close other Hub tabs and retry cover storage')) }
    request.onsuccess = () => { if (abandoned) request.result.close(); else resolve(request.result) }
  })
}
async function operation(dest        , before        , mode                                    , id = '', blob       )                            {
  const db = await database()
  try { unchanged(dest, before) } catch (error) { db.close(); throw error }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('covers', mode === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('covers')
      let value                  
      if (mode === 'reset') {
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          const entry = cursor.result
          if (!entry) return
          try { if (JSON.parse(String(entry.key))[0] === dest) entry.delete() } catch { /* unknown key is not ours */ }
          entry.continue()
        }
      } else {
        const key = JSON.stringify([dest, id])
        const request = mode === 'get' ? store.get(key) : mode === 'put' ? store.put(blob, key) : store.delete(key)
        request.onsuccess = () => { if (request.result instanceof Blob) value = request.result }
      }
      tx.oncomplete = () => { db.close(); try { unchanged(dest, before); resolve(value) } catch (error) { reject(error) } }
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Covers could not be saved in device storage; free space and retry')) }
    } catch (error) { db.close(); reject(error) }
  })
}
async function preparedCover(file      )                {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP cover smaller than 20 MB')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = [82,73,70,70].every((v, i) => bytes[i] === v) && [87,69,66,80].every((v, i) => bytes[i + 8] === v)
  if (!(file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp)) throw new Error('Cover content must match its raster file type')
  const bitmap = await createImageBitmap(file)
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('Cover exceeds 40 megapixels')
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
    if (!context) throw new Error('Cover drawing unavailable')
    let scale = Math.min(1, COVER_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    for (let n = 0; n < 5; n++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise      ((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare cover')), 'image/jpeg', 0.85))
      if (blob.size > 0 && blob.size <= COVER_MAX_BYTES && blob.type === 'image/jpeg') return blob
      scale *= 0.75
    }
    throw new Error('Cover is too large after resizing')
  } finally { bitmap.close() }
}
// New opaque IDs make replacement explicit: save first, update identity, then delete the old cover.
// If saving the identity fails, delete the newly returned cover; never discard the old one first.
export async function saveCover(dest        , key        , file      )                  {
  if (!string(key, 1000)) throw new Error('Invalid project key')
  const before = epoch(dest), blob = await preparedCover(file), id = `cover:${crypto.randomUUID()}`
  await operation(dest, before, 'put', id, blob)
  return id
}
export async function readCover(dest        , id        )                            {
  if (!coverId(id)) return
  const before = epoch(dest), blob = await operation(dest, before, 'get', id)
  if (!blob || blob.type !== 'image/jpeg' || !blob.size || blob.size > COVER_MAX_BYTES) return
  const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer())
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return
  try {
    const bitmap = await createImageBitmap(blob)
    try { unchanged(dest, before); if (bitmap.width > 0 && bitmap.height > 0 && Math.max(bitmap.width, bitmap.height) <= COVER_MAX_EDGE) return blob }
    finally { bitmap.close() }
  } catch { /* malformed saved pixels are not displayable */ }
}
export async function deleteCover(dest        , id        )                {
  if (!coverId(id)) throw new Error('Invalid cover ID')
  await operation(dest, epoch(dest), 'delete', id)
}
export async function resetCollection(dest        )                {
  // Advance before awaiting storage: preparation/open requests from before reset cannot write back.
  localStorage.setItem(slot('epoch', dest), crypto.randomUUID())
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
  for (const key of keys) {
    if (!key?.startsWith(PREFIX) || key.startsWith(`${PREFIX}epoch:`)) continue
    try { if (JSON.parse(key.slice(key.indexOf(':') + 1))[0] === dest) localStorage.removeItem(key) } catch { /* not ours */ }
  }
  await operation(dest, epoch(dest), 'reset')
}
