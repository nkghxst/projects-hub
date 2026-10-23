import { isPhotoPath, PHOTO_MAX_BYTES } from './core.js'
import { checkedPhoto } from './photos.js'

export function githubPhotos(contentsUrl                          , headers                       , signal                         , retired               ) {
  const fail = (name        , message        )        => { const error = new Error(message); error.name = name; throw error }
  const alive = () => { if (retired()) fail('other', 'Stopped: connection changed') }
  async function request(path        , init              = {}) {
    alive()
    if (!isPhotoPath(path)) fail('other', 'Invalid picture path')
    let res          
    try { res = await fetch(contentsUrl(path), { ...init, headers: { ...headers, ...init.headers }, signal, redirect: 'error', cache: 'no-store' }) }
    catch { alive(); return fail('offline', 'Picture transfer interrupted; saved note will retry') }
    alive()
    return res
  }
  async function readPhoto(path        )                {
    const res = await request(path, { headers: { accept: 'application/vnd.github.raw+json' } })
    if (!res.ok) fail('other', `Could not read picture (${res.status}); try Refresh after syncing`)
    if (Number(res.headers.get('content-length')) > PHOTO_MAX_BYTES) fail('other', 'Picture exceeds size limit')
    const reader = res.body?.getReader()
    if (!reader) fail('other', 'Picture response has no content')
    const chunks               = []; let length = 0
    while (true) {
      const { done, value } = await reader .read()
      if (done) break
      length += value.length
      if (length > PHOTO_MAX_BYTES) { await reader .cancel(); fail('other', 'Picture exceeds size limit') }
      chunks.push(value)
    }
    alive()
    return checkedPhoto(new Blob(chunks), path)
  }
  async function createPhoto(path        , blob      )                {
    if (!path.startsWith('memory/phone/attachments/')) fail('other', 'This connection only writes phone pictures')
    const safe = await checkedPhoto(blob, path)
    const bytes = new Uint8Array(await safe.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    const res = await request(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Phone note picture', content: btoa(binary) }) })
    if (res.status === 201) return
    if (res.status === 409 || res.status === 422) {
      const existing = new Uint8Array(await (await readPhoto(path)).arrayBuffer())
      alive()
      if (existing.length === bytes.length && existing.every((b,i) => b === bytes[i])) return
      fail('conflict', 'A different picture already exists at this path; the note remains saved here')
    }
    fail('other', `GitHub refused the picture (${res.status}); the note remains saved here`)
  }
  return { readPhoto, createPhoto }
}
