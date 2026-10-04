// The hub's pages, as hash routes: #/, #/record/<path>, #/inbox, #/capture[/<project>], #/settings.
                   
                    
                                    
                     
                                        
                        

export function currentRoute()        {
  const hash = location.hash
  if (hash.startsWith('#/record/')) return { name: 'record', path: decodeURIComponent(hash.slice(9)) }
  if (hash === '#/inbox') return { name: 'inbox' }
  if (hash.startsWith('#/capture')) return { name: 'capture', project: decodeURIComponent(hash.slice(10)) }
  if (hash === '#/settings') return { name: 'settings' }
  return { name: 'list' }
}

export const recordHref = (path        ) => `#/record/${encodeURIComponent(path)}`
export const captureHref = (project = '') => `#/capture${project ? `/${encodeURIComponent(project)}` : ''}`
