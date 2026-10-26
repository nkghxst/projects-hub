// Device-local presentation. Source records and the note queue never pass through these writes.
                                        
import { aliasesFor, sorter, SORTS, ageLabel, staleCheckpoint } from './core.js'
import { escapeHtml as esc } from './markdown.js'
import { state, changed, isPinned, errorText } from './state.js'
import { recordHref } from './routes.js'
import { changeOf } from './seen.js'
import { chips, providerTag, notesFor, queuedFor } from './parts.js'
import { snapshotChip } from './view-snapshot.js'
import { groupAsks } from './asks.js'
import { collectionEpoch, projectKey, readIdentity, saveIdentity, removeIdentity, projectArt, ICONS, COLOURS, readViews, saveViews, readVisits, saveCover, readCover, deleteCover, resetCollection, readLayout, saveLayout } from './collection.js'
                                                               
                                       

let destination = '', layoutEpoch = '', initialised = false, layout                 = defaults(), problem = ''
function defaults()                 { return { name: 'Current view', query: '', machine: 'all', filter: 'all', grouped: false, compact: false } }
export function collectionLayout()                 {
  const dest = state.source?.dest ?? '', epoch = collectionEpoch(dest)
  if (!initialised || dest !== destination || epoch !== layoutEpoch) {
    // A reset marker arrives before reset finishes removing old keys in another tab.
    const wasReset = initialised && dest === destination && epoch !== layoutEpoch
    layout = (wasReset ? undefined : readLayout(dest)) ?? { ...defaults(), ...(!initialised ? state.filters : {}) }
    destination = dest; layoutEpoch = epoch; initialised = true; problem = ''; closeEditor()
    state.filters = { query: layout.query, machine: layout.machine, sort: layout.sort ?? 'checkpoint' }
  }
  return layout
}
export function persistCollectionFilters()       {
  collectionLayout()
  layout = { ...layout, ...state.filters }
  try { saveLayout(destination, layout); problem = '' } catch (e) { problem = errorText(e) }
}
export function projectMembers(p         , data = state.data)            {
  if (!data || !p.file) return [p]
  const key = projectKey(p, data.sharedProjects)
  return data.projects.filter(q => projectKey(q, data.sharedProjects) === key)
}
export function collectionProjects(data      )            {
  const seen = new Set        ()
  return [...data.projects].sort((a,b) => (b.checkedMs ?? -1) - (a.checkedMs ?? -1)).filter(p => { if (!p.file) return true; const key = projectKey(p, data.sharedProjects); if (seen.has(key)) return false; seen.add(key); return true })
}
export function projectAsks(p         , data = state.data) {
  return groupAsks(projectMembers(p, data).flatMap(q => q.waits.map(w => ({ ...w, where: `${q.file} — ${w.where}` }))))
}
export function identityArt(p         , small = false, data = state.data)         {
  const dest = state.source?.dest ?? '', id = readIdentity(dest, projectKey(p, data?.sharedProjects))
  return `<span class="project-art${small ? ' mini-art' : ''}"${id.cover ? ` data-cover="${esc(id.cover)}"` : ''}>${projectArt(id)}</span>`
}
let urls           = [], renderGeneration = 0
export async function loadCollectionCovers()                {
  const generation = ++renderGeneration, dest = state.source?.dest, sourceGeneration = state.sourceGeneration
  urls.forEach(url => URL.revokeObjectURL(url)); urls = []
  if (!dest) return
  await Promise.all(Array.from(document.querySelectorAll             ('[data-cover]')).map(async el => {
    try {
      const blob = await readCover(dest, el.dataset.cover )
      if (generation !== renderGeneration || dest !== state.source?.dest || sourceGeneration !== state.sourceGeneration || !el.isConnected) return
      if (!blob) throw new Error('Cover unavailable; choose a replacement in Appearance')
      const url = URL.createObjectURL(blob); urls.push(url)
      const image = document.createElement('img'); image.src = url; image.alt = ''; el.replaceChildren(image)
    } catch (e) { if (el.isConnected && generation === renderGeneration) { const label = document.createElement('span'); label.className = 'cover-error'; label.textContent = errorText(e); el.append(label) } }
  }))
}
export function renderCollection(data      )         {
  const view = collectionLayout(), f = state.filters, dest = state.source?.dest ?? '', visits = readVisits(dest)
  const all = collectionProjects(data), names = [f.query.toLowerCase(), ...aliasesFor(f.query.trim(), data.aliases ?? []).map(s => s.toLowerCase())]
  const matches = (p         , filter = view.filter) => {
    const members = projectMembers(p, data)
    return (filter === 'all' || (filter === 'waiting' && members.some(q => q.waits.length)) || (filter === 'changed' && members.some(q => changeOf(q) !== 'none')) || (filter === 'pinned' && members.some(isPinned)) || (filter === 'recent' && Object.hasOwn(visits, projectKey(p, data.sharedProjects))))
  }
  const shown = all.filter(p => matches(p) && projectMembers(p,data).some(q => f.machine === 'all' || q.machine === f.machine) && (!f.query.trim() || projectMembers(p,data).some(q => names.some(n => `${q.name} ${q.state} ${q.next} ${q.waits.map(w=>w.text).join(' ')}`.toLowerCase().includes(n))))).sort(view.filter === 'recent' ? (a,b) => (visits[projectKey(b,data.sharedProjects)] ?? 0) - (visits[projectKey(a,data.sharedProjects)] ?? 0) : sorter(f.sort))
  const card = (p         ) => {
    const members = projectMembers(p,data), identity = readIdentity(dest, projectKey(p,data.sharedProjects))
    const stale = staleCheckpoint(p,members.find(q=>q!==p),data.now,state.staleDays)
    const noteCount = members.reduce((n,q)=>n+notesFor(q.file).length+queuedFor(q.file).length,0)
    const status = { waiting:'Needs you', active:'In progress', hold:'On hold or blocked', done:'Done', unstated:'State not stated' }[p.status]
    return `<article class="collection-project" aria-label="${esc(p.name)}"><div class="art-wrap"><a href="${recordHref(p.file)}" aria-label="Open ${esc(p.name)}">${identityArt(p,false,data)}</a><button class="art-pin" data-action="pin" data-value="${esc(p.file)}" data-pair="${esc(p.pairFile)}" aria-label="Pin ${esc(p.name)}" aria-pressed="${members.some(isPinned)}">${members.some(isPinned) ? '★' : '☆'}</button></div>
      <h3><a href="${recordHref(p.file)}">${esc(p.name)}</a></h3><p class="project-summary">${esc(p.state)}</p><div class="project-status"><span class="chip status-${p.status}">${status}</span>${members.some(q=>changeOf(q)!=='none') ? '<span class="chip changed">Changed</span>' : ''}</div>
      <div class="project-evidence"><span>Checkpoint ${esc(ageLabel(p.checkedMs,data.now,false))}</span>${snapshotChip(data.sharedProjects,p.file) || `<span>${members.map(q=>q.machine === 'desktop' ? 'Desktop record' : 'Laptop record').join(' · ')}</span>`}</div>
      <details class="project-more" data-key="${esc(`project-details:${projectKey(p,data.sharedProjects)}`)}"${state.openDetails.has(`project-details:${projectKey(p,data.sharedProjects)}`) ? ' open' : ''}><summary>Details &amp; appearance</summary><div class="project-sources">${members.map(q=>`<a href="${recordHref(q.file)}">${q.machine === 'desktop' ? 'Desktop' : 'Laptop'} record</a>`).join(' · ')}</div><p class="small muted">${esc(p.state)}</p>${providerTag(p)}${chips(p)}${stale === null ? '' : `<p class="small muted">Latest recorded checkpoint is ${stale} days old${state.isOffline ? ' in this saved copy' : ''}</p>`}${noteCount ? `<p class="small">${noteCount} open or queued notes</p>` : ''}<button class="link appearance" data-action="identity-edit" data-value="${esc(p.file)}" aria-label="Appearance for ${esc(p.name)}">Appearance${identity.group ? ` · ${esc(identity.group)}` : ''}</button></details></article>`
  }
  const groups = new Map                  ()
  for (const p of shown) { const name = view.grouped ? readIdentity(dest,projectKey(p,data.sharedProjects)).group || 'Ungrouped' : ''; groups.set(name,[...(groups.get(name) ?? []),p]) }
  return `<section class="collection" aria-label="Project collection"><header class="collection-heading"><h1>Everything you’re making.</h1><p class="muted">${all.length} project${all.length === 1 ? '' : 's'} in your collection.</p></header>
    <div class="collection-filters" role="group" aria-label="Collection filters">${([['all','All projects'],['waiting','Needs you'],['changed','Changed'],['pinned','Pinned'],['recent','Recent']]         ).map(([key,label])=>`<button data-action="collection-filter" data-value="${key}" aria-pressed="${view.filter===key}">${label} <span>${all.filter(p=>matches(p,key)).length}</span></button>`).join('')}</div>
    <div class="toolbar collection-tools"><input id="query" type="search" aria-label="Search projects and record text" placeholder="Find a project or record…" value="${esc(f.query)}" autocomplete="off"><label>Machine <select id="collection-machine">${(['all','desktop','laptop']         ).map(m=>`<option value="${m}"${f.machine===m?' selected':''}>${m==='all'?'Both machines':m==='desktop'?'Desktop':'Laptop'}</option>`).join('')}</select></label><label class="sort">Sort <select id="sort">${SORTS.map(s=>`<option value="${s.value}"${f.sort===s.value?' selected':''}>${esc(s.label)}</option>`).join('')}</select></label><button data-action="collection-group" aria-pressed="${view.grouped}">Group</button><button data-action="collection-compact" aria-pressed="${view.compact}">Compact</button></div>
    <details class="saved-views"><summary>Saved views &amp; local preferences</summary><p class="muted">Appearance, groups, recent visits and saved views stay on this device, for this destination only.</p><form id="save-view"><label>View name <input name="view-name" maxlength="80" required></label><button>Save view</button></form>${readViews(dest).map((v,i)=>`<div class="saved-view"><button data-action="collection-apply" data-value="${i}">${esc(v.name)}</button><button data-action="collection-delete" data-value="${i}" aria-label="Delete view ${esc(v.name)}">Delete</button></div>`).join('')}<button data-action="collection-reset">Reset collection preferences</button></details>
    ${problem ? `<p class="error" role="alert">${esc(problem)}</p>` : ''}<div class="collection-groups${view.compact?' compact':''}">${shown.length ? [...groups].map(([name,rows])=>`<section class="collection-group">${name?`<h2>${esc(name)} <span class="muted">${rows.length}</span></h2>`:''}<div class="project-grid">${rows.map(card).join('')}</div></section>`).join('') : '<p>No projects match this view. <button data-action="collection-clear">Clear filters</button></p>'}</div></section>`
}

let editor                           = null, editorToken = 0
export function closeEditor()       { editorToken++; editor?.close(); editor?.remove(); editor = null }
function openEditor(p         )       {
  closeEditor()
  const dest = state.source .dest, generation = state.sourceGeneration, token = editorToken, epoch = collectionEpoch(dest), key = projectKey(p,state.data?.sharedProjects), original = readIdentity(dest,key)
  const dialog = document.createElement('dialog'); editor = dialog; dialog.className = 'identity-editor'
  dialog.innerHTML = `<form><h2>Appearance for ${esc(p.name)}</h2><p class="muted">Saved only on this device for this destination.</p><label>Icon <select name="icon">${ICONS.map(x=>`<option${x===original.icon?' selected':''}>${x}</option>`).join('')}</select></label><label>Palette <select name="colour">${COLOURS.map((x,i)=>`<option value="${x}"${x===original.colour?' selected':''}>${['Ocean','Violet','Forest','Clay','Berry','Slate'][i]}</option>`).join('')}</select></label><label>Group <input name="group" maxlength="80" value="${esc(original.group)}"></label><label>Cover <input name="cover" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="small muted">PNG, JPEG or WebP, up to 20 MB. Stored at up to 512 pixels and 256 KB.</p>${original.cover?'<label><input type="checkbox" name="remove-cover"> Remove cover</label>':''}<p class="error" role="alert"></p><div class="actions"><button type="submit">Save appearance</button><button type="button" data-reset>Reset appearance</button><button type="button" data-close>Cancel</button></div></form>`
  document.body.append(dialog); dialog.showModal()
  dialog.addEventListener('cancel', ()=>closeEditor())
  dialog.querySelector('[data-close]') .addEventListener('click',()=>closeEditor())
  const valid = () => { if (token !== editorToken || dest !== state.source?.dest || generation !== state.sourceGeneration || epoch !== collectionEpoch(dest)) throw new Error('Stopped: destination or collection changed; reopen Appearance') }
  const apply = async (reset         ) => {
    const form = dialog.querySelector('form') , controls = Array.from(form.querySelectorAll                   ('button')); controls.forEach(b=>b.disabled=true)
    let newCover                    , committed = false
    try {
      valid()
      const fields = new FormData(form), file = fields.get('cover')        
      let next           = { icon:String(fields.get('icon')), colour:String(fields.get('colour')), group:String(fields.get('group')), ...(original.cover ? {cover:original.cover}: {}) }
      if (fields.has('remove-cover')) delete next.cover
      if (!reset && file?.size) { newCover = await saveCover(dest,key,file); next.cover = newCover }
      valid()
      if (reset) removeIdentity(dest,key); else saveIdentity(dest,key,next)
      committed = true
      if (original.cover && (reset || next.cover !== original.cover)) await deleteCover(dest,original.cover)
      closeEditor(); changed()
    } catch (e) {
      let message = errorText(e)
      if (newCover && !committed) { try { await deleteCover(dest,newCover) } catch (cleanup) { message += `; new cover cleanup failed: ${errorText(cleanup)}` } }
      if (committed) message = `Appearance saved, but old cover cleanup failed: ${message}. Reset collection preferences to retry cleanup.`
      dialog.querySelector('.error') .textContent = message
    } finally { controls.forEach(b=>b.disabled=false) }
  }
  dialog.querySelector('form') .addEventListener('submit',e=>{ e.preventDefault(); e.stopPropagation(); void apply(false) })
  dialog.querySelector('[data-reset]') .addEventListener('click',()=>void apply(true))
}
export async function collectionAction(action        , value        )                   {
  if (!action.startsWith('collection-') && action !== 'identity-edit') return false
  collectionLayout()
  const actionDest = destination, actionGeneration = state.sourceGeneration
  try {
    if (action === 'identity-edit') { const p = state.data?.projects.find(p=>p.file===value); if(p?.file && state.source) openEditor(p); return true }
    if (action === 'collection-filter') layout.filter = value                            
    if (action === 'collection-group') layout.grouped = !layout.grouped
    if (action === 'collection-compact') layout.compact = !layout.compact
    if (action === 'collection-clear') { layout = defaults(); state.filters = {query:'',machine:'all',sort:'checkpoint'} }
    if (action === 'collection-apply') { const v = readViews(destination)[Number(value)]; if(v) { layout = {...v}; state.filters = {query:v.query,machine:v.machine,sort:v.sort??'checkpoint'} } }
    if (action === 'collection-delete') saveViews(destination,readViews(destination).filter((_,i)=>i!==Number(value)))
    if (action === 'collection-reset') { if(!confirm('Reset appearance, covers, groups, saved views and recent visits for this destination on this device?')) return true; closeEditor(); await resetCollection(actionDest); if (actionDest !== state.source?.dest || actionGeneration !== state.sourceGeneration) return true; layout=defaults(); state.filters={query:'',machine:'all',sort:'checkpoint'} }
    saveLayout(destination,{...layout,...state.filters}); problem=''
  } catch(e) { problem=errorText(e) }
  changed(); return true
}
export function saveNamedView(form                 )       {
  collectionLayout()
  try { const name=String(new FormData(form).get('view-name')??'').trim(); const views=readViews(destination); saveViews(destination,[...views.filter(v=>v.name!==name),{...layout,...state.filters,name}]); problem='' } catch(e) { problem=errorText(e) }
  changed()
}
