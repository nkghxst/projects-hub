// The hub's pages, as hash routes: #/, #/record/<path>, #/inbox, #/capture[/<project>], #/settings.
                   
                    
                                                                           
                                                      
                     
                                        
                        

export function currentRoute()        {
  const hash = location.hash
  if (hash.startsWith('#/record/')) {
    const [path, query = ''] = hash.slice(9).split('?')
    const section = query.match(/^s=(-?\d+)$/)?.[1]
    return { name: 'record', path: decodeURIComponent(path), ...(section !== undefined ? { section: Number(section) } : {}) }
  }
  if (hash === '#/inbox') return { name: 'inbox' }
  if (hash.startsWith('#/capture')) return { name: 'capture', project: decodeURIComponent(hash.slice(10)) }
  if (hash === '#/settings') return { name: 'settings' }
  return { name: 'list' }
}

export const recordHref = (path        , section         ) =>
  `#/record/${encodeURIComponent(path)}${section !== undefined && section >= 0 ? `?s=${section}` : ''}`
export const captureHref = (project = '') => `#/capture${project ? `/${encodeURIComponent(project)}` : ''}`
