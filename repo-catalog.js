// Addresses only. This private profile file is never bundled into the public app.
export const REPO_CATALOG_PATH = 'memory/desktop/hub/repository-documents.md'
                                                                                                                     
                                                                               
export const validRepo = (s        )             => typeof s === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(s) && !['.', '..'].includes(s.split('/')[1])
const clean = (s        ,n       )             => typeof s==='string' && s.length>0 && s.length<=n && s.trim()===s && !/[\u0000-\u001f\u007f-\u009f]/.test(s)
export function validDocument(v        )                   {
  if(!v || typeof v!=='object' || Array.isArray(v))return false
  const d=v                
  return Object.keys(d).sort().join(',')==='id,kind,label,path,ref,repo' && clean(d.id,100) && clean(d.label,160) && ['roadmap','readme'].includes(d.kind) && validRepo(d.repo) &&
    (d.ref==='' || (clean(d.ref,255) && !/[\s\\~^:?*\[\]]/.test(d.ref) && d.ref!=='@' && !d.ref.includes('@{') && !d.ref.includes('..') && !d.ref.startsWith('-') && d.ref.split('/').every(p=>p!==''&&p!=='.'&&!p.startsWith('.')&&!p.endsWith('.')&&!p.endsWith('.lock')))) &&
    clean(d.path,1024) && !/[\\:]/.test(d.path) && /\.(md|markdown)$/i.test(d.path) && d.path.split('/').length<=16 && d.path.split('/').every(p=>p!==''&&p!=='.'&&p!=='..')
}
export function parseRepoCatalog(text       )                                     {
  const empty            ={version:1,records:{}}
  if(!text.trim())return {catalog:empty,error:''}
  try {
    if(text.length>128*1024)throw Error()
    const blocks=[...text.matchAll(/^```json\s*\r?\n([\s\S]*?)^```\s*$/gm)]
    if(blocks.length!==1)throw Error()
    const value=JSON.parse(blocks[0][1])
    if(!value||value.version!==1||Object.keys(value).sort().join(',')!=='records,version'||!value.records||typeof value.records!=='object'||Array.isArray(value.records)||Object.keys(value.records).length>200)throw Error()
    for(const [record,docs] of Object.entries(value.records)) {
      if(!/^memory\/(desktop|laptop)\/projects\/[A-Za-z0-9_-]+\.md$/.test(record)||!Array.isArray(docs)||docs.length>8||!docs.every(validDocument)||new Set(docs.map(d=>d.id)).size!==docs.length||new Set(docs.map(d=>JSON.stringify([d.repo.toLowerCase(),d.ref,d.path]))).size!==docs.length)throw Error()
    }
    return {catalog:value,error:''}
  }catch{return {catalog:empty,error:'Shared document catalogue is invalid; local sources remain available.'}}
}
