import { beginAnnotation, syncAnnotation, cancelAnnotation } from './photo-annotation.js'
import { parseNote, PHOTO_MAX_COUNT, isPhotoPath } from './core.js'
import { escapeHtml as esc } from './markdown.js'
import { state, changed, toast } from './state.js'
import { photoStore, preparePhoto, checkedPhoto } from './photos.js'
import { projectKey, collectionEpoch, readIdentity, saveIdentity, saveCover, deleteCover } from './collection.js'

const urls = new Set        ()
let viewer                           = null
export function clearPhotoViews() {
  for (const url of urls) URL.revokeObjectURL(url)
  urls.clear(); viewer?.remove(); viewer = null
}
export function clearDraftPhotos() {
  cancelAnnotation()
  state.photoGeneration++
  for (const p of state.draftPhotos) URL.revokeObjectURL(p.url)
  state.draftPhotos = []; state.photoBusy = false
}
export async function addPictures(files        ) {
  if (state.photoBusy || state.savingDraft || !state.source?.createPhoto) return
  if (files.length + state.draftPhotos.length > PHOTO_MAX_COUNT) return toast('Up to four pictures per note')
  const generation = state.photoGeneration, source = state.source
  state.photoBusy = true; changed()
  try {
    const prepared = []
    for (const file of files) prepared.push(await preparePhoto(file))
    if (generation !== state.photoGeneration || source !== state.source) return
    state.draftPhotos.push(...prepared.map(p => ({ ...p, url: URL.createObjectURL(p.blob) })))
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not prepare pictures') }
  finally { if (generation === state.photoGeneration) state.photoBusy = false; changed() }
}
export function removePicture(index        ) {
  if (state.savingDraft || state.photoBusy) return
  const [p] = state.draftPhotos.splice(index, 1)
  if (p) URL.revokeObjectURL(p.url)
  changed()
}
export function capturePictures()         {
  if (!state.source?.createPhoto) return ''
  return `<section class="capture-pictures"><span>Pictures <span class="muted">(up to four)</span></span>
    <div class="actions"><label class="button photo-picker">Add pictures<input class="photo-input" id="draft-pictures" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>
    <label class="button photo-picker">Take photo<input class="photo-input" id="draft-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label></div>
    <div class="picture-grid">${state.draftPhotos.map((p,i) => `<figure><button type="button" data-action="draft-photo-view" data-value="${i}" aria-label="Enlarge picture ${i+1}"><img src="${p.url}" alt="Selected picture ${i+1}"></button><button type="button" data-action="photo-remove" data-value="${i}">Remove picture ${i+1}</button><button type="button" data-action="draft-photo-annotate" data-value="${i}">Annotate picture ${i+1}</button></figure>`).join('')}</div>
    ${state.photoBusy ? '<p role="status">Preparing pictures…</p>' : ''}
    <p class="muted small">Large pictures are resized; location metadata is removed. Saved privately with this note. Handling it keeps the pictures.</p></section>`
}
export function notePictures(n                                                                        )         {
  const paths = n.text ? parseNote(n.path, n.text).attachments ?? [] : n.attachments ?? []
  return paths.length ? `<div class="picture-grid">${paths.filter(isPhotoPath).map((p,i) => `<button type="button" class="note-picture" data-action="photo-view" data-photo="${esc(p)}" data-note="${esc(n.path)}" data-dest="${esc(n.dest ?? state.source?.dest ?? '')}" aria-label="View picture ${i+1}">View picture ${i+1}</button>`).join('')}</div>` : ''
}
export function enlargePicture(url        , annotate             , cover                      ) {
  viewer?.remove()
  const dialog = document.createElement('dialog')
  dialog.className = 'picture-viewer'
  const close = document.createElement('button'); close.textContent = 'Close picture'
  close.addEventListener('click', () => dialog.close())
  const img = document.createElement('img'); img.src = url; img.alt = 'Note picture'
  const zoom = document.createElement('button'); zoom.textContent = 'Zoom in'
  zoom.addEventListener('click', () => { const full = img.classList.toggle('full-size'); zoom.textContent = full ? 'Fit picture' : 'Zoom in' })
  const controls = document.createElement('div'); controls.className = 'picture-controls'; controls.append(close, zoom)
  if (annotate) { const edit=document.createElement('button');edit.textContent='Annotate as new note';edit.onclick=()=>{dialog.close();annotate()};controls.append(edit) }
  if (cover) {
    const use=document.createElement('button'),status=document.createElement('p');use.textContent='Use as project cover';status.setAttribute('role','status')
    use.onclick=async()=>{use.disabled=true;status.textContent='Saving cover on this device…';try{await cover();dialog.close()}catch(e){status.textContent=e instanceof Error?e.message:'Could not save cover'}finally{use.disabled=false}}
    controls.append(use,status)
  }
  dialog.append(controls, img); document.body.append(dialog); viewer = dialog; dialog.showModal()
}
// No token in image URLs: fetch through the authenticated source then use a short-lived blob URL.
export async function viewPicture(button             , enlarge = true) {
  const path = button.dataset.photo ?? '', note = button.dataset.note ?? '', dest = button.dataset.dest ?? ''
  const source = state.source, generation = state.sourceGeneration
  if (!isPhotoPath(path) || !source) return
  button.setAttribute('aria-busy', 'true')
  try {
    let blob = await photoStore('get', dest, path).catch(() => undefined)
    if (!blob && dest === source.dest && source.readPhoto) blob = await source.readPhoto(path, note)
    if (!blob) throw new Error('Picture is unavailable offline. Reconnect to its repository and retry.')
    blob = await checkedPhoto(blob, path)
    if (source !== state.source || generation !== state.sourceGeneration || !button.isConnected) return
    // Cache is best-effort for already-published pictures; queue storage is mandatory on capture.
    if (dest === source.dest) await photoStore('put', dest, path, blob).catch(() => {})
    if (source !== state.source || generation !== state.sourceGeneration || !button.isConnected) return
    const picture=blob
    const savedNote=dest===source.dest ? state.notes.find(n=>n.path===note&&(n.attachments??[]).includes(path)) : undefined
    const annotate=savedNote&&source.createPhoto&&(source.kind==='local'?state.data?.canWrite===true:state.data?.canWrite!==false) ? ()=>{
      if(source!==state.source||generation!==state.sourceGeneration||dest!==state.source?.dest||!state.notes.some(n=>n.path===note&&(n.attachments??[]).includes(path)))return
      void beginAnnotation(picture,{note:{path:savedNote.path,project:savedNote.project,title:savedNote.title,source:savedNote.source,photo:path},dest})
    } : undefined
    const project = savedNote && state.data?.projects.find(p=>p.file===savedNote.project)
    const cover = project ? async()=>{
      const key=projectKey(project,state.data?.sharedProjects),epoch=collectionEpoch(dest),before=readIdentity(dest,key)
      const valid=()=>{
        const current=state.data?.projects.find(p=>p.file===project.file)
        if(source!==state.source||generation!==state.sourceGeneration||dest!==state.source?.dest||epoch!==collectionEpoch(dest)||!current||projectKey(current,state.data?.sharedProjects)!==key||!state.notes.some(n=>n.path===note&&n.project===project.file&&(n.attachments??[]).includes(path)))throw Error('Stopped: source or collection changed. Reopen the picture.')
      }
      let id                 ,committed=false
      try {
        valid();id=await saveCover(dest,key,new File([picture],'note-cover',{type:picture.type}));valid()
        if(JSON.stringify(readIdentity(dest,key))!==JSON.stringify(before))throw Error('Appearance changed while saving. Reopen the picture and try again.')
        saveIdentity(dest,key,{...before,cover:id});committed=true
        if(before.cover)await deleteCover(dest,before.cover)
        changed();toast('Project cover saved on this device.')
      } catch(e) {
        if(id&&!committed)await deleteCover(dest,id)
        if(committed){changed();toast('Cover saved, but old cover cleanup failed. Reset collection preferences can clear all local covers and preferences for this destination.');return}
        throw e
      }
    } : undefined
    const url = URL.createObjectURL(blob); urls.add(url)
    const img = document.createElement('img'); img.src = url; img.alt = button.getAttribute('aria-label') ?? 'Note picture'
    button.replaceChildren(img); button.onclick = () => enlargePicture(url, annotate, cover)
    button.removeAttribute('data-action')
    if (enlarge) enlargePicture(url, annotate, cover)
  } catch (error) {
    button.textContent = 'Picture unavailable — tap to retry'
    if (enlarge) toast(error instanceof Error ? error.message : 'Could not load picture')
  } finally { button.removeAttribute('aria-busy') }
}
export function loadPicturePreviews() {
  syncAnnotation()
  clearPhotoViews()
  for (const button of document.querySelectorAll             ('[data-action="photo-view"]')) void viewPicture(button, false)
}
