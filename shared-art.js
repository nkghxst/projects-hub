// Private profile artwork is fetched at runtime; only addresses travel in the catalogue.
export const ART_CATALOG_PATH = 'memory/desktop/hub/artwork/catalogue.md'
export const ART_ENVELOPE_MAX = 200_000
export const ART_IMAGE_MAX = 96 * 1024
export const ART_CACHE_MAX = 4 * 1024 * 1024
                                                                       
                                                                          
const encoder = new TextEncoder()
export const validArtworkPath = (path         )                 => typeof path === 'string' && /^memory\/desktop\/hub\/artwork\/[a-z0-9][a-z0-9-]{0,79}-[a-f0-9]{64}\.md$/.test(path)
export function validArtEntry(value         )                    {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value            
  return Object.keys(v).sort().join(',') === 'asset,group,sha256' && validArtworkPath(v.asset) &&
    typeof v.sha256 === 'string' && /^[a-f0-9]{64}$/.test(v.sha256) && v.asset.endsWith(`-${v.sha256}.md`) &&
    typeof v.group === 'string' && v.group.length <= 80 && v.group.trim() === v.group && !/[\u0000-\u001f\u007f-\u009f]/.test(v.group)
}
function fencedJson(text        , max        )          {
  if (typeof text !== 'string' || text.length > max || encoder.encode(text).length > max) throw Error('Artwork exceeds size limit')
  const blocks = [...text.matchAll(/^```json\s*\r?\n([\s\S]*?)^```\s*$/gm)]
  if (blocks.length !== 1) throw Error('Invalid artwork format')
  return JSON.parse(blocks[0][1])
}
export function parseArtCatalog(text        )                                         {
  const empty             = { version: 1, records: {} }
  if (!text.trim()) return { catalog: empty, error: '' }
  try {
    const v = fencedJson(text, 128 * 1024)              
    if (!v || Object.keys(v).sort().join(',') !== 'records,version' || v.version !== 1 || !v.records || typeof v.records !== 'object' || Array.isArray(v.records) || Object.keys(v.records).length > 200) throw Error()
    for (const [record, entry] of Object.entries(v.records)) {
      if (!/^memory\/(desktop|laptop)\/projects\/[A-Za-z0-9_-]+\.md$/.test(record) || !validArtEntry(entry)) throw Error()
    }
    return { catalog: v, error: '' }
  } catch { return { catalog: empty, error: 'Shared artwork catalogue is invalid; local appearance remains available.' } }
}
export function sharedArtFor(text        , record        )                       {
  const { catalog } = parseArtCatalog(text)
  return Object.hasOwn(catalog.records, record) ? catalog.records[record] : undefined
}
// Check frame dimensions before asking a browser to decode any JPEG.
function jpegDimensions(bytes            )          {
  if (bytes.length < 16 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return false
  let pos = 2, frame = false
  while (pos < bytes.length - 2) {
    if (bytes[pos++] !== 255) return false
    while (bytes[pos] === 255) pos++
    const marker = bytes[pos++]
    if (marker === 0 || marker === 216 || marker === 217 || (marker >= 208 && marker <= 215)) return false
    const length = (bytes[pos] << 8) | bytes[pos + 1]
    if (length < 2 || pos + length > bytes.length - 2) return false
    if ([192, 193, 194].includes(marker)) {
      if (length < 8 || bytes[pos + 2] !== 8) return false
      const h = (bytes[pos + 3] << 8) | bytes[pos + 4], w = (bytes[pos + 5] << 8) | bytes[pos + 6]
      if (!w || !h || w > 1024 || h > 1024 || frame) return false
      frame = true
    }
    if (marker === 218) return frame && length >= 6
    pos += length
  }
  return false
}
export async function checkedArtwork(text        , entry          )                {
  if (!validArtEntry(entry)) throw Error('Invalid artwork address')
  const v = fencedJson(text, ART_ENVELOPE_MAX)                                                                        
  if (!v || Object.keys(v).sort().join(',') !== 'data,mediaType,sha256,version' || v.version !== 1 || v.mediaType !== 'image/jpeg' || v.sha256 !== entry.sha256 || typeof v.data !== 'string' || v.data.length > Math.ceil(ART_IMAGE_MAX / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.data)) throw Error('Invalid artwork envelope')
  const binary = atob(v.data), bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  if (btoa(binary) !== v.data || bytes.length > ART_IMAGE_MAX || !jpegDimensions(bytes)) throw Error('Invalid artwork JPEG')
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
  if (digest !== entry.sha256) throw Error('Artwork hash mismatch')
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  if (typeof createImageBitmap === 'function') { const bitmap = await createImageBitmap(blob); bitmap.close() }
  return blob
}
export async function readArtworkResponse(res          )                  {
  if (!res.ok) throw Error(`Artwork unavailable (${res.status})`)
  if (Number(res.headers.get('content-length')) > ART_ENVELOPE_MAX) throw Error('Artwork exceeds size limit')
  const reader = res.body?.getReader()
  if (!reader) throw Error('Artwork response is empty')
  const chunks               = []; let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > ART_ENVELOPE_MAX) { await reader.cancel(); throw Error('Artwork exceeds size limit') }
    chunks.push(value)
  }
  return new Blob(chunks).text()
}
const PREFIX = 'hub.artwork.cache.'
const RESET_KEY = 'hub.artwork.reset'
const DEST_RESET_PREFIX = 'hub.artwork.reset.'
const generations = new Map                ()
let generation = 0
function resetStamp(dest        )                {
  try { return JSON.stringify([localStorage.getItem('hub.epoch'), localStorage.getItem(RESET_KEY), localStorage.getItem(DEST_RESET_PREFIX + dest)]) }
  catch { return null }
}
                                              
function readCache(dest        )        {
  try {
    const text = localStorage.getItem(PREFIX + dest) ?? '[]'
    if (encoder.encode(text).length > ART_CACHE_MAX) return []
    const v = JSON.parse(text)
    return Array.isArray(v) && v.length <= 200 && v.every(x => x && validArtworkPath(x.asset) && typeof x.text === 'string' && x.text.length <= ART_ENVELOPE_MAX) ? v : []
  } catch { return [] }
}
export function sharedArtworkCacheBytes(dest        )         {
  try { return encoder.encode(localStorage.getItem(PREFIX + dest) ?? '').length } catch { return 0 }
}
export function clearSharedArtworkCache(dest         )       {
  if (dest !== undefined) generations.set(dest, (generations.get(dest) ?? 0) + 1)
  else generation++
  // Persist the barrier first so requests running in another tab also retire.
  // Do not report success if either the barrier or removal could not be saved.
  const key = dest === undefined ? RESET_KEY : DEST_RESET_PREFIX + dest
  const stamp = crypto.randomUUID()
  localStorage.setItem(key, stamp)
  if (localStorage.getItem(key) !== stamp) throw Error('Artwork reset could not be saved')
  if (dest !== undefined) {
    localStorage.removeItem(PREFIX + dest)
    if (localStorage.getItem(PREFIX + dest) !== null) throw Error('Artwork cache could not be cleared')
  } else {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    for (const key of keys) if (key?.startsWith(PREFIX)) {
      localStorage.removeItem(key)
      if (localStorage.getItem(key) !== null) throw Error('Artwork cache could not be cleared')
    }
  }
}
export async function loadSharedArtwork(dest        , entry          , readArtwork                                   )                {
  if (!validArtEntry(entry)) throw Error('Invalid artwork address')
  const gen = generation, localGen = generations.get(dest) ?? 0
  const epoch = resetStamp(dest)
  const alive = () => {
    const current = resetStamp(dest)
    if (generation !== gen || (generations.get(dest) ?? 0) !== localGen || epoch !== current) throw Error('Artwork cache was reset')
  }
  const cached = readCache(dest).find(x => x.asset === entry.asset)
  if (cached) {
    let blob                  
    try { blob = await checkedArtwork(cached.text, entry) } catch { /* Corrupt copies are never displayed. */ }
    alive()
    if (blob) return blob
  }
  const text = await readArtwork(entry.asset)
  alive()
  const blob = await checkedArtwork(text, entry)
  alive()
  const items = readCache(dest).filter(x => x.asset !== entry.asset)
  items.push({ asset: entry.asset, text })
  while (items.length > 200 || encoder.encode(JSON.stringify(items)).length > ART_CACHE_MAX) items.shift()
  alive()
  // An unavailable reset marker means storage cannot safely receive this request.
  if (epoch !== null) {
    const serialized = JSON.stringify(items)
    try { localStorage.setItem(PREFIX + dest, serialized) } catch { /* Display remains available if offline storage is full. */ }
    try { alive() } catch (error) {
      // A reset in another tab may race the synchronous write. Remove only our copy.
      try { if (localStorage.getItem(PREFIX + dest) === serialized) localStorage.removeItem(PREFIX + dest) } catch {}
      throw error
    }
  }
  return blob
}
