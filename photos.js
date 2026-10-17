// Private image bytes live in IndexedDB, never in the public shell cache or localStorage.
import { isPhotoPath, PHOTO_MAX_BYTES } from './core.js'

                                                            
export async function checkedPhoto(blob      , path        )                {
  if (!isPhotoPath(path) || !blob.size || blob.size > PHOTO_MAX_BYTES) throw new Error('Invalid picture path or size')
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!(path.endsWith('.png') ? png : jpg)) throw new Error('Picture content does not match its file type')
  return new Blob([blob], { type: png ? 'image/png' : 'image/jpeg' })
}

// One key per destination + image; committing bytes precedes the durable text queue entry.
async function database()                       {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hub-private-pictures', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('pictures')
    request.onerror = () => reject(new Error('Picture storage unavailable; keep this page open and try again'))
    request.onblocked = () => reject(new Error('Close other Hub tabs and retry picture storage'))
    request.onsuccess = () => resolve(request.result)
  })
}
export async function photoStore(mode                         , dest = '', path = '', blob       )                            {
  const epoch = localStorage.getItem('hub.epoch')
  const db = await database()
  if (epoch !== localStorage.getItem('hub.epoch')) { db.close(); throw new Error('Stopped: app data was reset') }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('pictures', mode === 'get' ? 'readonly' : 'readwrite')
      const store = tx.objectStore('pictures'), key = JSON.stringify([dest, path])
      const request = mode === 'get' ? store.get(key) : mode === 'put' ? store.put(blob, key) : store.clear()
      let value                  
      request.onsuccess = () => { value = request.result instanceof Blob ? request.result : undefined }
      tx.oncomplete = () => { db.close(); resolve(value) }
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Pictures could not be saved on this device. Free some browser storage and retry.')) }
    } catch (error) { db.close(); reject(error) }
  })
}

export async function preparePhoto(file      )                 {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture')
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a picture smaller than 20 MB')
  const image = await createImageBitmap(file)
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) throw new Error('Picture exceeds 40 megapixels')
    let scale = Math.min(1, 4096 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d') 
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const type = file.type === 'image/png' && attempt === 0 ? 'image/png' : 'image/jpeg'
      const blob = await new Promise      ((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare picture')), type, 0.88))
      if (blob.size <= PHOTO_MAX_BYTES) return { blob, extension: type === 'image/png' ? 'png' : 'jpg' }
      scale *= 0.75
    }
    throw new Error('Picture is too large after resizing; crop it and try again')
  } finally { image.close() }
}
