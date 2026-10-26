// Originals are read-only inputs. An edit enters the normal new-note queue only after export.
import { state, changed, toast, EMPTY_DRAFT } from './state.js'
import { preparePhoto } from './photos.js'
import { isWebUrl } from './core.js'
import { captureHref } from './routes.js'
                                                                                                                                  
                                                                                           
let annotationRequest=0
let editor                                                                        = null
export function cancelAnnotation() { annotationRequest++;editor?.cancel() }
export function syncAnnotation() { if(editor&&!editor.valid())cancelAnnotation() }
export async function beginAnnotation(blob      , context         ) {
  const writable=()=>state.source?.kind==='local' ? state.data?.canWrite===true : state.data?.canWrite!==false
  if(state.photoBusy||state.savingDraft||!state.source?.createPhoto||!writable())return
  cancelAnnotation();const request=annotationRequest
  const source=state.source,generation=state.sourceGeneration,photoGeneration=state.photoGeneration,epoch=localStorage.getItem('hub.epoch')
  const draft=state.draft, draftText=JSON.stringify(draft), pictures=[...state.draftPhotos]
  const valid=()=>request===annotationRequest&&state.source===source&&state.sourceGeneration===generation&&state.photoGeneration===photoGeneration&&localStorage.getItem('hub.epoch')===epoch&&state.draft===draft&&JSON.stringify(state.draft)===draftText&&writable()&&Boolean(state.source?.createPhoto)&&pictures.length===state.draftPhotos.length&&pictures.every((p,i)=>state.draftPhotos[i]===p)&&(!context.note||(context.dest===source.dest&&state.notes.some(n=>n.path===context.note .path&&(context.note .photo ? (n.attachments??[]).includes(context.note .photo ) : false))))
  if(!valid())return
  let image            
  try { image=await createImageBitmap(blob) } catch {toast('Could not open this picture; your draft is unchanged');return}
  if(!valid()){image.close();return}
  if(!image.width||!image.height||image.width*image.height>40_000_000){image.close();toast('Picture exceeds the annotation size limit; your draft is unchanged');return}
  const dialog=document.createElement('dialog');dialog.className='annotation-editor'
  dialog.innerHTML=`<h2>Annotate picture</h2><p>Drag to point something out, or enter positions as percentages. The original stays unchanged.</p>
    <div class="annotation-tools"><label>Shape<select name="tool" aria-label="Shape"><option value="arrow">Arrow</option><option value="rectangle">Rectangle</option></select></label><label>Colour<select name="colour" aria-label="Colour"><option value="#dc2626">Red</option><option value="#2563eb">Blue</option><option value="#111111">Black</option><option value="#ffffff">White</option></select></label></div>
    <canvas tabindex="0" aria-label="Picture annotation canvas"></canvas><fieldset class="annotation-coordinates"><legend>Keyboard positions (%)</legend>${['x','y','endX','endY'].map((n,i)=>`<label>${['Start X','Start Y','End X','End Y'][i]}<input name="${n}" type="number" min="0" max="100" value="${i<2?20:70}"></label>`).join('')}<button type="button" data-edit="add">Add shape</button></fieldset>
    <div class="actions"><button type="button" data-edit="undo">Undo</button><button type="button" data-edit="reset">Reset marks</button><button type="button" data-edit="cancel">Cancel annotation</button><button type="button" class="primary" data-edit="save">Use annotated picture</button></div><p role="status" class="annotation-status"></p>`
  const canvas=dialog.querySelector('canvas') ,ctx=canvas.getContext('2d') , shapes        =[]
  const scale=Math.min(1,4096/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale))
  let closed=false,busy=false,revision=0,pending           =null
  const close=()=>{if(closed)return;closed=true;image.close();dialog.remove();if(editor?.dialog===dialog)editor=null}
  const active=()=>!closed&&valid()
  editor={dialog,valid,cancel:close}
  const status=dialog.querySelector('.annotation-status') 
  const field=(name       )=>dialog.querySelector                                    (`[name=${name}]`) 
  const draw=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);for(const s of [...shapes,...(pending?[pending]:[])]){const x=s.x*canvas.width/100,y=s.y*canvas.height/100,ex=s.endX*canvas.width/100,ey=s.endY*canvas.height/100;ctx.strokeStyle=s.colour;ctx.lineWidth=Math.max(3,canvas.width/220);ctx.beginPath();if(s.tool==='rectangle')ctx.rect(x,y,ex-x,ey-y);else{ctx.moveTo(x,y);ctx.lineTo(ex,ey);const a=Math.atan2(ey-y,ex-x),l=Math.max(14,canvas.width/40);ctx.moveTo(ex-l*Math.cos(a-.5),ey-l*Math.sin(a-.5));ctx.lineTo(ex,ey);ctx.lineTo(ex-l*Math.cos(a+.5),ey-l*Math.sin(a+.5))}ctx.stroke()}}
  const point=(e             )=>{const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))}}
  canvas.onpointerdown=e=>{if(busy)return;const p=point(e);pending={tool:field('tool').value,colour:field('colour').value,...p,endX:p.x,endY:p.y};canvas.setPointerCapture(e.pointerId);e.preventDefault()}
  canvas.onpointermove=e=>{if(!pending||busy)return;const p=point(e);pending.endX=p.x;pending.endY=p.y;draw()}
  canvas.onpointerup=()=>{if(pending){shapes.push(pending);pending=null;revision++;draw()}}
  canvas.onpointercancel=()=>{pending=null;draw()}
  dialog.addEventListener('cancel',e=>{e.preventDefault();close()})
  dialog.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();if(!busy){shapes.pop();revision++;draw()}}})
  dialog.addEventListener('click',async e=>{
    const action=(e.target               ).closest             ('[data-edit]')?.dataset.edit
    if(action==='cancel'){close();return}
    if(action==='reset'){revision++;shapes.length=0;pending=null;draw();return}
    if(busy||!active())return
    if(action==='undo'){shapes.pop();revision++;draw()}
    if(action==='add'){const nums=['x','y','endX','endY'].map(n=>Number(field(n).value));if(nums.some(n=>!Number.isFinite(n)||n<0||n>100)){status.textContent='Use positions between 0 and 100';return}shapes.push({tool:field('tool').value,colour:field('colour').value,x:nums[0],y:nums[1],endX:nums[2],endY:nums[3]});revision++;draw()}
    if(action!=='save')return
    busy=true;status.textContent='Preparing annotated picture…';const edit=revision
    try {
      const exported=await new Promise      ((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not export picture')),'image/png'))
      if(!active()||edit!==revision)return
      const photo=await preparePhoto(new File([exported],'annotation.png',{type:'image/png'}))
      if(!active()||edit!==revision)return
      // Ask only after successful export; cancellation or failed export never touches the old draft.
      if(context.note&&(draft.body||draft.title||draft.source||draft.project||pictures.length)&&!confirm('A draft is already open. Replace its text and pictures with this new annotated note? Cancel preserves the existing draft.')){status.textContent='Existing draft preserved. Cancel or try again when ready.';return}
      if(!active()||edit!==revision)return
      const url=URL.createObjectURL(photo.blob)
      if(context.draftIndex!==undefined){const old=state.draftPhotos[context.draftIndex];if(!old){URL.revokeObjectURL(url);return}state.draftPhotos[context.draftIndex]={...photo,url};URL.revokeObjectURL(old.url)}
      else if(context.note){for(const p of state.draftPhotos)URL.revokeObjectURL(p.url);state.draft={...EMPTY_DRAFT,kind:context.note.project?'note':'idea',project:context.note.project,title:`Annotation: ${context.note.title}`.slice(0,120),source:isWebUrl(context.note.source)?context.note.source:'',body:`Annotation of ${context.note.path}`};state.draftPhotos=[{...photo,url}]}
      state.photoGeneration++;close();changed();if(context.note)location.hash=captureHref(context.note.project)
    } catch(error){if(active())status.textContent=`${error instanceof Error?error.message:'Could not annotate'}. Your draft is unchanged.`}
    finally {busy=false;if(!closed&&edit!==revision)status.textContent='Marks changed during export. Save again.';if(!valid())close()}
  })
  document.body.append(dialog);dialog.showModal();draw()
}
