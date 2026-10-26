// Repository reading is independent of profile note-writing and collection redraws.
import { state, changed, errorText, toast } from './state.js'
import { escapeHtml as esc, renderMarkdown } from './markdown.js'
import { resolvePath } from './core.js'
import { recordHref } from './routes.js'
import { REPO_READER_PREFIX, readRepoDocuments, saveRepoDocuments, hasRepoToken, saveRepoToken, forgetRepoToken, clearRepoCopies, retireRepoReads, readRepoCopy, refreshRepoDocument, repoSourceUrl, repoLinkResolver } from './repo-reader.js'
                                                                         

                                                                                           
let dialog                        = null, serial = 0, opener = '', sourceDest = '', sourceGeneration = 0
let project                    = null, selected = '', existingLink = ''
export function repoCardControls(file       )        {
  return `<div class="repo-card-actions">${['Roadmap','Docs'].map(label=>`<button id="repo-${label.toLowerCase()}-${esc(encodeURIComponent(file))}" data-action="repo-${label.toLowerCase()}" data-value="${esc(file)}">${label}</button>`).join('')}</div>`
}
export function repoSettingsMarkup()        {
  return `<section class="card repo-settings"><h3>Repository documents</h3><p>Separate read connection: ${hasRepoToken()?'token saved on this device':'not connected'}. Roadmaps, READMEs and their saved copies stay on this device.</p><button id="repo-connection-settings" data-action="repo-connection">Repository connection</button></section>`
}
export function closeRepoReader(restore = true)      {
  serial++; retireRepoReads()
  const id = opener; dialog?.close(); dialog?.remove(); dialog = null; project = null; existingLink = ''
  if (restore && id) document.getElementById(id)?.focus()
}
export function reconcileRepoReader()      {
  if (dialog && (sourceDest !== (state.source?.dest ?? '') || sourceGeneration !== state.sourceGeneration)) closeRepoReader(false)
}
function createDialog(id       , context                   )                   {
  closeRepoReader(false); opener=id; project=context; selected=''; existingLink=''
  sourceDest=state.source?.dest??''; sourceGeneration=state.sourceGeneration
  const d=document.createElement('dialog'); d.className='repo-reader'; d.setAttribute('aria-labelledby','repo-reader-title'); dialog=d
  document.body.append(d)
  d.addEventListener('cancel',e=>{e.preventDefault();closeRepoReader()})
  d.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return
    const controls=Array.from(d.querySelectorAll             ('button,input,select,textarea,a[href],[tabindex]')).filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&el.getClientRects().length>0)
    const first=controls[0],last=controls[controls.length-1]
    // Native modal isolation does not itself wrap focus before browser chrome.
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  })
  d.addEventListener('click',e=>{
    const el=(e.target               ).closest             ('[data-repo]'); if(!el)return
    const action=el.dataset.repo
    if(action==='close')closeRepoReader()
    else if(action==='manage')showMappings()
    else if(action==='connection')showConnection()
    else if(action==='reader')showReader()
    else if(action==='refresh')void readSelected()
    else if(action==='add')addMapping()
    else if(action==='remove')el.closest('fieldset')?.remove()
    else if(action==='forget'||action==='clear'){
      try { if(action==='forget')forgetRepoToken(); else clearRepoCopies(); closeRepoReader(); toast(action==='forget'?'Repository token forgotten. Dated saved copies remain on this device.':'Saved repository documents cleared. Mappings and connection remain.'); changed() }
      catch(error){message(errorText(error))}
    }
  })
  d.addEventListener('change',e=>{if((e.target               ).id==='repo-document'){selected=(e.target                     ).value;retireRepoReads();void readSelected()}})
  d.addEventListener('submit',e=>{
    e.preventDefault(); e.stopPropagation()
    const form=e.target                   
    try {
      if(form.id==='repo-token-form'){
        const input=form.elements.namedItem('read-token')                    
        saveRepoToken(input.value); input.value=''; closeRepoReader(); toast('Repository read token saved on this device.'); changed()
      } else if(form.id==='repo-mappings'&&project){
        const docs=Array.from(form.querySelectorAll                     ('fieldset')).map(row=>{
          const value=(name       )=>(row.querySelector(`[name=${name}]`)                    ).value.trim()
          return {id:row.dataset.id ,label:value('label'),kind:value('kind')                        ,repo:value('repo'),ref:value('ref'),path:value('path')}
        })
        saveRepoDocuments(project.scope,docs); selected=docs[0]?.id??'';showReader();changed()
      }
    } catch(error){message(errorText(error))}
  })
  return d
}
function heading(title       )        {
  return `<header class="repo-heading"><h2 id="repo-reader-title">${esc(title)}</h2><button type="button" data-repo="close" aria-label="Close repository reader">Close</button></header>`
}
function message(text       )      { const el=dialog?.querySelector('.repo-error');if(el)el.textContent=text }
export function openRepoConnection(id       )      { const d=createDialog(id,null);showConnection();d.showModal() }
export function openRepoReader(context              ,mode                 ,id       )      {
  const d=createDialog(id,context), docs=readRepoDocuments(context.scope)
  selected=(mode==='roadmap'?docs.find(doc=>doc.kind==='roadmap'):docs[0])?.id??''
  if(selected||docs.length)showReader();else showMappings()
  d.showModal()
  // The existing record reader owns shared-profile files. Never translate local paths.
  const source=state.source, generation=state.sourceGeneration
  if(source)void source.record(context.record).then(record=>{
    if(dialog!==d||project!==context||source!==state.source||generation!==state.sourceGeneration||sourceDest!==state.source?.dest)return
    const text=[record.readFirst,record.preamble,...record.sections.map(s=>s.body)].join('\n')
    for(const match of text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g)){
      if(!/roadmap/i.test(match[1]+' '+match[2])||! /\.(md|markdown)$/i.test(match[2])||/^[a-z]+:|^[/\\]|\\/i.test(match[2]))continue
      const path=resolvePath(context.record.split('/').slice(0,-1).join('/'),match[2])
      if(path&&/^memory\/[A-Za-z0-9._\-/]+\.md$/.test(path)&&!path.includes('..')) {existingLink=`<a href="${recordHref(path)}">Existing record roadmap</a>`;break}
    }
    const link=dialog.querySelector('.repo-profile-link');if(link)link.innerHTML=existingLink
  }).catch(()=>{})
}
function showConnection()      {
  if(!dialog)return
  serial++;retireRepoReads()
  dialog.innerHTML=heading('Repository connection')+`<p>This separate connection only reads repository documents. Set it up separately on each device.</p><p>Create a fine-grained GitHub token with <strong>Only select repositories</strong> and <strong>Contents: read-only</strong>. The permission covers all contents of those repositories, beyond the documents you configure. The Hub cannot verify the token’s permissions; this reader only sends GET requests to api.github.com.</p><p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub fine-grained token settings</a></p><form id="repo-token-form" autocomplete="off"><label>Repository read token<input name="read-token" type="password" required autocomplete="new-password" autocapitalize="off" spellcheck="false"></label><p class="muted">${hasRepoToken()?'Saving replaces the existing repository token.':'No repository token saved.'} Your profile note-writing connection is separate.</p><button class="primary">Save repository token</button></form><p>Forgetting the token keeps dated offline copies. Revoke the token on GitHub to disable its access. Private document copies remain in this browser until cleared; clearing copies keeps your mappings.</p><div class="actions"><button type="button" data-repo="forget">Forget repository token</button><button type="button" data-repo="clear">Clear saved documents</button>${project?'<button type="button" data-repo="reader">Back to documents</button>':''}</div><p class="repo-error error" role="alert"></p>`
}
function mappingRow(doc              )        {
  return `<fieldset data-id="${esc(doc?.id??crypto.randomUUID())}"><legend>Document source</legend><label>Label<input name="label" maxlength="160" required value="${esc(doc?.label??'')}"></label><label>Kind<select name="kind" aria-label="Kind"><option value="roadmap"${doc?.kind==='readme'?'':' selected'}>Roadmap</option><option value="readme"${doc?.kind==='readme'?' selected':''}>README</option></select></label><label>Owner/repository<input name="repo" list="repo-suggestions" placeholder="owner/repository" required autocapitalize="off" spellcheck="false" value="${esc(doc?.repo??'')}"></label><label>Ref (blank for default branch)<input name="ref" value="${esc(doc?.ref??'')}" autocapitalize="off" spellcheck="false"></label><label>Markdown path<input name="path" placeholder="docs/ROADMAP.md" required value="${esc(doc?.path??'')}" autocapitalize="off" spellcheck="false"></label><button type="button" data-repo="remove">Remove document</button></fieldset>`
}
function addMapping()      {
  const rows=dialog?.querySelector('.repo-mapping-rows');if(!rows)return
  if(rows.children.length>=8){message('A project can have up to eight documents.');return}
  rows.insertAdjacentHTML('beforeend',mappingRow());(rows.lastElementChild?.querySelector('input')                    )?.focus()
}
function showMappings()      {
  if(!dialog||!project)return
  serial++;retireRepoReads()
  const docs=readRepoDocuments(project.scope)
  dialog.innerHTML=heading(`Sources for ${project.name}`)+`<p>Choose up to eight labelled Markdown documents. Map each repository separately, for example Parent roadmap and Site README. Repository suggestions are optional; choose each source explicitly. Local absolute paths cannot be read here.</p><button type="button" data-repo="connection">Repository connection</button><p class="repo-profile-link">${existingLink}</p><form id="repo-mappings"><datalist id="repo-suggestions">${[...new Set(project.repos)].filter(r=>/^https:\/\/github.com\/[^/]+\/[^/]+$/.test(r)).map(r=>`<option value="${esc(r.slice(19))}"></option>`).join('')}</datalist><div class="repo-mapping-rows">${(docs.length?docs:[undefined]).map(mappingRow).join('')}</div><div class="actions"><button type="button" data-repo="add">Add document</button><button class="primary">Save sources</button><button type="button" data-repo="reader">Back to documents</button></div></form><p class="repo-error error" role="alert"></p>`
}
function dateText(at       )        { return new Date(at).toLocaleString('en-GB') }
function copyMarkup(copy         )        {
  const now=Date.now(), future=copy.fetchedAt>now+300000||(copy.updatedAt!==null&&Date.parse(copy.updatedAt)>now+300000)
  let body       
  try { body=renderMarkdown(copy.text,repoLinkResolver(copy),{maxDepth:32,maxWork:1024*1024}) }
  catch { body=`<p class="notice">Formatting limited: this document is shown as plain text.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(copy.text)}</pre>` }
  return `<dl class="repo-provenance"><dt>Source last changed</dt><dd>${copy.updatedAt?esc(dateText(Date.parse(copy.updatedAt))):'Unknown — source history unavailable'}</dd><dt>Fetched</dt><dd>${esc(dateText(copy.fetchedAt))}</dd><dt>Revision</dt><dd><code title="${esc(copy.revision)}">${esc(copy.revision.slice(0,12))}</code></dd><dt>Source</dt><dd><a href="${esc(repoSourceUrl(copy))}" target="_blank" rel="noopener noreferrer">${esc(copy.document.repo+' / '+copy.document.path)}</a></dd></dl>${future?'<p class="notice">Clock discrepancy: a source or fetch timestamp is more than five minutes in the future.</p>':''}${now-copy.fetchedAt>7*86400000?'<p class="notice">Old saved copy: fetched more than seven days ago.</p>':''}<div class="md repo-document-body">${body}</div>`
}
function showReader()      {
  if(!dialog||!project)return
  serial++;retireRepoReads()
  const docs=readRepoDocuments(project.scope)
  if(!docs.some(doc=>doc.id===selected))selected=docs[0]?.id??''
  dialog.innerHTML=heading(`Documents for ${project.name}`)+`<p class="repo-profile-link">${existingLink}</p>${docs.length?`<label>Document<select id="repo-document" aria-label="Document">${docs.map(doc=>`<option value="${esc(doc.id)}"${doc.id===selected?' selected':''}>${esc(doc.label)} — ${esc(doc.repo)}</option>`).join('')}</select></label>`:'<p>No repository documents configured. Add a roadmap or README source to start reading.</p>'}<div class="actions">${docs.length?'<button class="primary" type="button" data-repo="refresh">Read document</button>':''}<button type="button" data-repo="manage">Manage sources</button><button type="button" data-repo="connection">Repository connection</button></div><p class="repo-read-status" role="status"></p><p class="repo-error error" role="alert"></p><section class="repo-copy" aria-label="Document content"></section>`
  if(docs.length)void readSelected()
}
async function readSelected()               {
  if(!dialog||!project)return
  retireRepoReads();const request=++serial, d=dialog, context=project, doc=readRepoDocuments(context.scope).find(doc=>doc.id===selected)
  if(!doc)return
  const content=d.querySelector('.repo-copy') , status=d.querySelector('.repo-read-status') , button=d.querySelector                   ('[data-repo=refresh]') 
  const saved=readRepoCopy(context.scope,doc)
  content.innerHTML=saved?copyMarkup(saved):'<p>No saved copy on this device.</p>'
  status.textContent=hasRepoToken()?(saved?'Saved copy shown. Reading repository…':'Reading repository…'):'Not refreshed: no repository read token. Any dated saved copy is shown.'
  button.textContent='Refresh document';message('')
  if(!hasRepoToken())return
  const result=await refreshRepoDocument(context.scope,doc)
  if(request!==serial||dialog!==d||sourceGeneration!==state.sourceGeneration||sourceDest!==state.source?.dest)return
  if(result.copy)content.innerHTML=copyMarkup(result.copy)
  else if(result.error.startsWith('Stopped:'))content.innerHTML='<p>Read stopped. Reopen the document to read its current mapping.</p>'
  status.textContent=result.refreshed?(result.cached?'Read succeeded. Dated copy saved on this device.':'Read succeeded. This copy was not saved.'):(result.copy?'Not refreshed. Showing the dated saved copy.':'Not refreshed. No saved copy available.')
  message(result.error)
}
globalThis.addEventListener?.('storage',event=>{const key=(event                ).key;if(key===null||key==='hub.epoch'||key.startsWith(REPO_READER_PREFIX))closeRepoReader()})
