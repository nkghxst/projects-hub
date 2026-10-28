// Device-local presentation. Source records and the note queue never pass through these writes.
                                        
import { aliasesFor, sorter, SORTS, ageLabel, staleCheckpoint, textOf } from './core.js'
import { escapeHtml as esc } from './markdown.js'
import { state, changed, isPinned, errorText } from './state.js'
import { recordHref } from './routes.js'
import { changeOf } from './seen.js'
import { chips, providerTag, notesFor, queuedFor } from './parts.js'
import { snapshotChip } from './view-snapshot.js'
import { groupAsks } from './asks.js'
import { collectionEpoch, projectKey, readIdentity, saveIdentity, removeIdentity, projectArt, ICONS, COLOURS, readViews, saveViews, readVisits, saveCover, readCover, deleteCover, resetCollection, readLayout, saveLayout } from './collection.js'
                                                               
                                       
import { repoCardControls } from './repo-reader-ui.js'
import { effectiveIdentity, ARCHIVED_GROUP } from './collection.js'
import { sharedArtFor, parseArtCatalog, loadSharedArtwork } from './shared-art.js'
import { readDisplaySettings } from './display-settings.js'

const sharedEntry = (p         , data = state.data) => sharedArtFor(data?.artCatalogText ?? '',p.file)
const appearance = (p         , data = state.data) => effectiveIdentity(state.source?.dest ?? '',projectKey(p,data?.sharedProjects),sharedEntry(p,data)?.group)
let showHidden = false

let destination = '', layoutEpoch = '', initialised = false, layout                 = defaults(), problem = ''
function defaults()                 { const prefs=readDisplaySettings(state.source?.dest ?? ''); return { name: 'Current view', query: '', machine: 'all', filter: 'all', grouped: prefs.grouped, compact: prefs.artwork==='compact', sort:prefs.sort } }
export function applyDisplayLayout()       { const prefs=readDisplaySettings(state.source?.dest ?? ''); collectionLayout(); layout.grouped=prefs.grouped; layout.compact=prefs.artwork==='compact'; state.filters.sort=prefs.sort; persistCollectionFilters() }
export function collectionLayout()                 {
  const dest = state.source?.dest ?? '', epoch = collectionEpoch(dest)
  if (!initialised || dest !== destination || epoch !== layoutEpoch) {
    // A reset marker arrives before reset finishes removing old keys in another tab.
    const wasReset = initialised && dest === destination && epoch !== layoutEpoch
    layout = (wasReset ? undefined : readLayout(dest)) ?? { ...defaults(), ...(!initialised ? state.filters : {}) }
    destination = dest; layoutEpoch = epoch; initialised = true; problem = ''; showHidden=false; closeEditor()
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
// Quote the source; never manufacture a short status by dropping qualifications.
function cardStatus(p         , data      )         {
  const current = Boolean(p.stateLine?.trim())
  const text = textOf(current ? p.stateLine : p.state || '').replace(/\s+/g, ' ').trim()
  const key = `card-status:${projectKey(p, data.sharedProjects)}`, expanded = state.openDetails.has(key)
  const source = current ? 'Current checkpoint' : text ? 'Index summary · no checkpoint status' : ''
  return `<div class="card-status" data-expanded="${expanded}"><p class="project-summary">${esc(text || 'No status recorded.')}</p>
    ${text ? `<div class="summary-source"><a href="${recordHref(p.file)}">${source}</a></div><button id="${esc(`card-status-toggle:${encodeURIComponent(p.file)}`)}" class="link summary-toggle" data-action="collection-status" data-value="${esc(p.file)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'Read full'} status for ${esc(p.name)}">${expanded ? 'Less' : 'Read full status'}</button>` : ''}</div>`
}
function cardAsk(p         , data      )         {
  const asks = projectAsks(p,data), stated = asks.filter(a=>a.isStated), shown = stated.length ? stated : asks
  if (!shown.length) return ''
  const kind = stated.length ? 'stated' : 'possible'
  return `<div class="card-ask ${kind}"><strong>${stated.length ? 'Needs you' : 'Possible ask'}</strong><p>${esc(shown[0].text)}</p><a href="${recordHref(p.file)}">View ${shown.length} ${kind} ask${shown.length===1?'':'s'} &amp; sources</a></div>`
}
export function identityArt(p         , small = false, data = state.data)         {
  const id = appearance(p,data), shared=sharedEntry(p,data)
  return `<span class="project-art${small ? ' mini-art' : ''}"${id.artSource==='local' && id.cover ? ` data-cover="${esc(id.cover)}"` : id.artSource==='shared' && shared ? ` data-shared-art="${esc(p.file)}"` : ''}>${projectArt(id)}</span>`
}
let urls           = [], renderGeneration = 0
export function revealSelectedFilter()       {
  const row = document.querySelector             ('.collection-filters')
  const focus = document.activeElement
  const selected = focus instanceof HTMLElement && row?.contains(focus) ? focus : row?.querySelector             ('[aria-pressed=true]')
  if (!row || !selected) return
  const outer = row.getBoundingClientRect(), inner = selected.getBoundingClientRect()
  // Only move this horizontal strip; never jump the page on a data refresh.
  if (inner.left < outer.left) row.scrollLeft -= outer.left - inner.left
  else if (inner.right > outer.right) row.scrollLeft += inner.right - outer.right
}
export async function loadCollectionCovers()                {
  const generation = ++renderGeneration, dest = state.source?.dest, sourceGeneration = state.sourceGeneration
  urls.forEach(url => URL.revokeObjectURL(url)); urls = []
  if (!dest) return
  const source=state.source 
  await Promise.all(Array.from(document.querySelectorAll             ('[data-cover],[data-shared-art]')).map(async el => {
    try {
      const entry=el.dataset.sharedArt ? sharedArtFor(state.data?.artCatalogText ?? '',el.dataset.sharedArt) : undefined
      const blob = entry ? await loadSharedArtwork(dest,entry,source.readArtwork) : await readCover(dest, el.dataset.cover )
      if (generation !== renderGeneration || dest !== state.source?.dest || sourceGeneration !== state.sourceGeneration || !el.isConnected) return
      if (!blob) throw new Error('Cover unavailable; choose a replacement in Appearance')
      const url = URL.createObjectURL(blob); urls.push(url)
      const image = document.createElement('img'); image.src = url; image.alt = ''; el.replaceChildren(image)
    } catch (e) { if (el.isConnected && generation === renderGeneration) { const label = document.createElement('span'); label.className = 'cover-error'; label.textContent = errorText(e); el.append(label) } }
  }))
}
export function renderCollection(data      )         {
  const view = collectionLayout(), f = state.filters, dest = state.source?.dest ?? '', visits = readVisits(dest)
  const complete = collectionProjects(data), hiddenCount=complete.filter(p=>appearance(p,data).hidden).length, all=complete.filter(p=>showHidden || !appearance(p,data).hidden), names = [f.query.toLowerCase(), ...aliasesFor(f.query.trim(), data.aliases ?? []).map(s => s.toLowerCase())]
  const matches = (p         , filter = view.filter) => {
    const members = projectMembers(p, data)
    return (filter === 'all' || (filter === 'waiting' && members.some(q => q.waits.some(w=>w.isStated))) || (filter === 'changed' && members.some(q => changeOf(q) !== 'none')) || (filter === 'pinned' && members.some(isPinned)) || (filter === 'recent' && Object.hasOwn(visits, projectKey(p, data.sharedProjects))))
  }
  const shown = all.filter(p => matches(p) && projectMembers(p,data).some(q => f.machine === 'all' || q.machine === f.machine) && (!f.query.trim() || projectMembers(p,data).some(q => names.some(n => `${q.name} ${q.state} ${q.next} ${q.waits.map(w=>w.text).join(' ')}`.toLowerCase().includes(n))))).sort(view.filter === 'recent' ? (a,b) => (visits[projectKey(b,data.sharedProjects)] ?? 0) - (visits[projectKey(a,data.sharedProjects)] ?? 0) : sorter(f.sort))
  const card = (p         ) => {
    const members = projectMembers(p,data), identity = appearance(p,data)
    const stale = staleCheckpoint(p,members.find(q=>q!==p),data.now,state.staleDays)
    const noteCount = members.reduce((n,q)=>n+notesFor(q.file).length+queuedFor(q.file).length,0)
    const status = { waiting:'Needs you', active:'In progress', hold:'On hold or blocked', done:'Done', unstated:'State not stated' }[p.status]
    const ask = cardAsk(p,data)
    return `<article class="collection-project" aria-label="${esc(p.name)}"><div class="art-wrap"><a href="${recordHref(p.file)}" aria-label="Open ${esc(p.name)}">${identityArt(p,false,data)}</a><button class="art-edit" data-action="identity-edit" data-value="${esc(p.file)}" aria-label="Change artwork for ${esc(p.name)}">Artwork</button><button class="art-pin" data-action="pin" data-value="${esc(p.file)}" data-pair="${esc(p.pairFile)}" aria-label="Pin ${esc(p.name)}" aria-pressed="${members.some(isPinned)}">${members.some(isPinned) ? '★' : '☆'}</button></div>
      <h3><a href="${recordHref(p.file)}">${esc(p.name)}</a></h3>${identity.hidden?'<span class="chip">Hidden on this device</span>':''}${ask}${cardStatus(p,data)}<div class="project-status">${p.status==='waiting'&&ask?'':`<span class="chip status-${p.status}">${status}</span>`}${members.some(q=>changeOf(q)!=='none') ? '<span class="chip changed">Changed</span>' : ''}</div>
      <div class="project-evidence"><span>Checkpoint ${esc(ageLabel(p.checkedMs,data.now,false))}</span>${snapshotChip(data.sharedProjects,p.file) || `<span>${members.map(q=>q.machine === 'desktop' ? 'Desktop record' : 'Laptop record').join(' · ')}</span>`}</div>${p.file?repoCardControls(p.file):''}
      <details class="project-more" data-key="${esc(`project-details:${projectKey(p,data.sharedProjects)}`)}"${state.openDetails.has(`project-details:${projectKey(p,data.sharedProjects)}`) ? ' open' : ''}><summary>Details &amp; appearance</summary><div class="project-sources">${members.map(q=>`<a href="${recordHref(q.file)}">${q.machine === 'desktop' ? 'Desktop' : 'Laptop'} record</a>`).join(' · ')}</div><p class="small muted">${esc(p.state)}</p>${providerTag(p)}${chips(p)}${stale === null ? '' : `<p class="small muted">Latest recorded checkpoint is ${stale} days old${state.isOffline ? ' in this saved copy' : ''}</p>`}${noteCount ? `<p class="small">${noteCount} open or queued notes</p>` : ''}<button class="link appearance" data-action="identity-edit" data-value="${esc(p.file)}" aria-label="Appearance for ${esc(p.name)}">Organise &amp; appearance${identity.group ? ` · ${esc(identity.group)}` : ''}</button></details></article>`
  }
  const groups = new Map                  ()
  for (const p of shown) { const identity=appearance(p,data); const name = identity.group===ARCHIVED_GROUP ? ARCHIVED_GROUP : view.grouped ? identity.group || 'Ungrouped' : ''; groups.set(name,[...(groups.get(name) ?? []),p]) }
  const optionsOpen = state.openDetails.has('collection-options')
  const activeOptions = Number(f.machine !== 'all') + Number(f.sort !== 'checkpoint') + Number(view.grouped) + Number(view.compact)
  return `<section class="collection${readDisplaySettings(dest).artwork==='off'?' artwork-off':''}${view.filter==='waiting'?' asks-focused':''}" aria-label="Project collection"><header class="collection-heading"><h1>Everything you’re making.</h1><p class="muted">${all.length} project${all.length === 1 ? '' : 's'} in your collection.</p></header>
    <div class="collection-filters" role="group" aria-label="Collection filters">${([['all','All projects'],['waiting','Needs you'],['changed','Changed'],['pinned','Pinned'],['recent','Recent']]         ).map(([key,label])=>`<button id="collection-filter-${key}" data-action="collection-filter" data-value="${key}" aria-pressed="${view.filter===key}">${label} <span>${all.filter(p=>matches(p,key)).length}</span></button>`).join('')}</div>
    <div class="toolbar collection-tools"><input id="query" type="search" aria-label="Search projects and record text" placeholder="Find a project or record…" value="${esc(f.query)}" autocomplete="off"><button id="collection-options-toggle" class="mobile-view-options" data-action="collection-options" aria-controls="collection-options" aria-expanded="${optionsOpen}">View options${activeOptions ? ` · ${activeOptions} active` : ''}</button>
    <div id="collection-options" class="collection-options" data-open="${optionsOpen}"><div class="collection-option-controls"><label>Machine <select id="collection-machine">${(['all','desktop','laptop']         ).map(m=>`<option value="${m}"${f.machine===m?' selected':''}>${m==='all'?'Both machines':m==='desktop'?'Desktop':'Laptop'}</option>`).join('')}</select></label><label class="sort">Sort <select id="sort">${SORTS.map(s=>`<option value="${s.value}"${f.sort===s.value?' selected':''}>${esc(s.label)}</option>`).join('')}</select></label><button data-action="collection-hidden" aria-pressed="${showHidden}">Show hidden (${hiddenCount})</button><button data-action="collection-group" aria-pressed="${view.grouped}">Group</button><button data-action="collection-compact" aria-pressed="${view.compact}">Compact</button></div>
    <details class="saved-views"><summary>Saved views &amp; local preferences</summary><p class="muted">Shared artwork and default groups come from your profile. Your overrides, hidden projects, recent visits and saved views stay on this device.</p><form id="save-view"><label>View name <input name="view-name" maxlength="80" required></label><button>Save view</button></form>${readViews(dest).map((v,i)=>`<div class="saved-view"><button data-action="collection-apply" data-value="${i}">${esc(v.name)}</button><button data-action="collection-delete" data-value="${i}" aria-label="Delete view ${esc(v.name)}">Delete</button></div>`).join('')}<button data-action="collection-reset">Reset collection preferences</button></details>
    </div></div>${view.filter==='waiting'?'<p class="small muted">Only projects with explicitly stated requests appear in this filtered collection. Observation age does not create a request.</p>':''}${parseArtCatalog(data.artCatalogText ?? "").error ? `<p class="notice">${esc(parseArtCatalog(data.artCatalogText ?? "").error)}</p>` : ""}${problem ? `<p class="error" role="alert">${esc(problem)}</p>` : ''}<div class="collection-groups${view.compact?' compact':''}">${shown.length ? [...groups].sort(([a],[b])=>Number(a===ARCHIVED_GROUP)-Number(b===ARCHIVED_GROUP)).map(([name,rows])=>name===ARCHIVED_GROUP ? `<details class="collection-group archived-projects" data-key="archived-projects"${f.query.trim() || state.openDetails.has('archived-projects')?' open':''}><summary>${esc(name)} (${rows.length})</summary><p class="muted small">Filed away from the overview. Project records and notes are retained; this does not change their recorded status.</p><div class="project-grid">${rows.map(card).join('')}</div></details>` : `<section class="collection-group">${name?`<h2>${esc(name)} <span class="muted">${rows.length}</span></h2>`:''}<div class="project-grid">${rows.map(card).join('')}</div></section>`).join('') : '<p>No projects match this view. <button data-action="collection-clear">Clear filters</button></p>'}</div></section>`
}

let editor                           = null, editorToken = 0
export function closeEditor()       { editorToken++; editor?.close(); editor?.remove(); editor = null }
function openEditor(p         )       {
  closeEditor()
  const dest = state.source .dest, generation = state.sourceGeneration, token = editorToken, epoch = collectionEpoch(dest), key = projectKey(p,state.data?.sharedProjects), original = readIdentity(dest,key), shown=appearance(p), shared=sharedEntry(p)
  const dialog = document.createElement('dialog'); editor = dialog; dialog.className = 'identity-editor'
  dialog.innerHTML = `<form><h2>Appearance for ${esc(p.name)}</h2><p class="muted">Saved only on this device for this destination.</p><label>Icon <select name="icon">${ICONS.map(x=>`<option${x===original.icon?' selected':''}>${x}</option>`).join('')}</select></label><label>Palette <select name="colour">${COLOURS.map((x,i)=>`<option value="${x}"${x===original.colour?' selected':''}>${['Ocean','Violet','Forest','Clay','Berry','Slate'][i]}</option>`).join('')}</select></label><label>Group source <select name="group-source"><option value="shared"${shown.groupSource==='shared'?' selected':''}>Shared default${shared?' · '+esc(shared.group):' · Ungrouped'}</option><option value="local"${shown.groupSource==='local'?' selected':''}>My group on this device</option></select></label><label>My group <input name="group" list="hub-group-options" maxlength="80" value="${esc(shown.group)}"></label><datalist id="hub-group-options">${[...new Set([...Object.values(parseArtCatalog(state.data?.artCatalogText ?? '').catalog.records).map(e=>e.group),'Music & studio','Apps & creative','AI & workflow','Learning & leisure','Home & setup',ARCHIVED_GROUP])].map(g=>`<option value="${esc(g)}"></option>`).join('')}</datalist><div class="actions"><button type="button" data-archive>Move to Done &amp; archived</button><button type="button" data-ungroup>Ungroup on this device</button></div><label><input type="checkbox" name="hidden"${shown.hidden?' checked':''}> Hide from this device’s overview</label><p class="small muted">Use Show hidden to find and restore it. Moving or hiding never deletes records or notes.</p><label>Artwork source <select name="art-source"><option value="shared"${shown.artSource==='shared'?' selected':''}>Shared cover${shared?'':' (none available yet)'}</option><option value="local"${shown.artSource==='local'?' selected':''}>My uploaded cover${original.cover?' (saved)':' (choose a file below)'}</option><option value="builtin"${shown.artSource==='builtin'?' selected':''}>Built-in icon and palette</option></select></label><p class="small muted">Switching to the shared cover keeps your uploaded cover available to restore.</p><label>Cover <input name="cover" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="small muted">PNG, JPEG or WebP, up to 20 MB. Stored at up to 512 pixels and 256 KB.</p>${original.cover?'<label><input type="checkbox" name="remove-cover"> Remove cover</label>':''}<p class="error" role="alert"></p><div class="actions"><button type="submit">Save appearance</button><button type="button" data-reset>Reset appearance</button><button type="button" data-close>Cancel</button></div></form>`
  document.body.append(dialog); dialog.showModal()
  dialog.addEventListener('cancel', ()=>closeEditor())
  dialog.querySelector('[data-close]') .addEventListener('click',()=>closeEditor())
  const groupInput=dialog.querySelector                  ('[name=group]') , groupSource=dialog.querySelector                   ('[name=group-source]') 
  groupInput.addEventListener('input',()=>{groupSource.value='local'})
  dialog.querySelector('[data-archive]') .addEventListener('click',()=>{groupInput.value=ARCHIVED_GROUP;groupSource.value='local'})
  dialog.querySelector('[data-ungroup]') .addEventListener('click',()=>{groupInput.value='';groupSource.value='local'})
  const valid = () => { if (token !== editorToken || dest !== state.source?.dest || generation !== state.sourceGeneration || epoch !== collectionEpoch(dest)) throw new Error('Stopped: destination or collection changed; reopen Appearance') }
  const apply = async (reset         ) => {
    const form = dialog.querySelector('form') , controls = Array.from(form.querySelectorAll                   ('button')); controls.forEach(b=>b.disabled=true)
    let newCover                    , committed = false
    try {
      valid()
      const fields = new FormData(form), file = fields.get('cover')        
      let next           = { icon:String(fields.get('icon')), colour:String(fields.get('colour')), group:String(fields.get('group')), groupSource:String(fields.get('group-source'))                           , artSource:String(fields.get('art-source'))                         , hidden:fields.has('hidden'), ...(original.cover ? {cover:original.cover}: {}) }
      if (fields.has('remove-cover')) delete next.cover
      if (!reset && file?.size) { newCover = await saveCover(dest,key,file); next.cover = newCover; next.artSource='local' }
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
    if (action === 'collection-options') { const key='collection-options'; if(state.openDetails.has(key)) state.openDetails.delete(key); else state.openDetails.add(key); changed(); return true }
    if (action === 'collection-status') { const p = state.data?.projects.find(p=>p.file===value); if (p) { const key=`card-status:${projectKey(p,state.data?.sharedProjects)}`; if(state.openDetails.has(key)) state.openDetails.delete(key); else state.openDetails.add(key) }; changed(); return true }
    if (action === 'identity-edit') { const p = state.data?.projects.find(p=>p.file===value); if(p?.file && state.source) openEditor(p); return true }
    if (action === 'collection-filter') layout.filter = value                            
    if (action === 'collection-hidden') showHidden=!showHidden
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
