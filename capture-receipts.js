import { readQueue } from './state.js'
// Evidence of this device's actual writes; never infer publication from sync times.
                                                                                   
                                                                                                                  
const PREFIX = 'hub.receipt.v1.'
export function receiptLabel(status               )         {
  return { queued: 'Saved on this device · waiting to send', retrying: 'Retrying · saved on this device', error: 'Needs retry · saved on this device', clone: 'Saved to desktop clone · publication unverified', published: 'Published to GitHub · write confirmed' }[status]
}
const key = (dest        , id        ) => PREFIX + JSON.stringify([dest,id])
const confirmed = (status               ) => status === 'clone' || status === 'published'
export function removeUnfinishedReceipt(dest        , id        ) {
  const raw=localStorage.getItem(key(dest,id))
  let receipt                 = null
  try { receipt=JSON.parse(raw??'null') } catch { return }
  if(receipt && ['queued','retrying','error'].includes(receipt.status)) localStorage.removeItem(key(dest,id))
}
export function readReceipts(dest        )            {
  const values            = []
  for (let i=0;i<localStorage.length;i++) {
    const k=localStorage.key(i);if(!k?.startsWith(PREFIX))continue
    try {
      const r=JSON.parse(localStorage.getItem(k)??'null')
      if(r && r.dest===dest && typeof r.id==='string' && typeof r.path==='string' && typeof r.title==='string' && Number.isFinite(r.at) && ['queued','retrying','error','clone','published'].includes(r.status) && k===key(dest,r.id) && (confirmed(r.status) || readQueue().some(q=>q.id===r.id&&q.dest===r.dest))) values.push(r)
    } catch { /* Damaged receipts cannot establish success. */ }
  }
  return values.sort((a,b)=>b.at-a.at).slice(0,40)
}
export function writeReceipt(r         ) {
  // An exact retry or failed queue cleanup must never downgrade completed-write evidence.
  let previous                 = null
  try { previous=JSON.parse(localStorage.getItem(key(r.dest,r.id))??'null') } catch { /* Invalid evidence cannot confirm a write. */ }
  if(previous?.dest===r.dest&&previous.id===r.id&&confirmed(previous.status)&&!confirmed(r.status)) return
  localStorage.setItem(key(r.dest,r.id),JSON.stringify(r))
  const keep=new Set(readReceipts(r.dest).map(x=>key(x.dest,x.id)))
  const remove         =[]
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(PREFIX)||keep.has(k))continue;try{if(JSON.parse(localStorage.getItem(k)??'null')?.dest===r.dest)remove.push(k)}catch{}}
  for(const k of remove)localStorage.removeItem(k)
}
