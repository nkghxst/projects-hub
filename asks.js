                                     

// Compare only demonstrably equivalent text. Keep case, internal punctuation, links,
// questions and all meaningful words: these can distinguish commands and narrow asks.
function comparable(text        )         {
  // Treat code, links and escaped Markdown literally. Partial Markdown parsing can
  // erase identifiers, URL characters or significant code whitespace. Keeping an
  // extra visual duplicate is safer than combining distinct requests.
  if (/[`\\]|\[[^\]\n]*\]\(/.test(text)) return text.trim()
  // Only paired emphasis at prose boundaries is formatting. In particular,
  // __init__.py and word__parts are identifiers, not emphasis to remove.
  return text.replace(/(^|\s|\()(\*\*|__)([^\s*_\n](?:[^*_\n]*?[^\s*_\n])?)\2(?=$|\s|[!?;:,)]|\.(?=$|\s))/g, '$1$3')
    .replace(/^\s*(?:[-*+]\s+)?Waiting on [^:\n]{1,100}:\s*/i, '')
    .replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').trim()
}
export function groupAsks(waits        )                                                           {
  const groups = new Map                                                                ()
  for (const wait of waits) {
    const key = JSON.stringify([wait.isStated, comparable(wait.text)])
    const existing = groups.get(key)
    if (existing) { if (!existing.sources.includes(wait.where)) existing.sources.push(wait.where) }
    else groups.set(key, { text: wait.text, isStated: wait.isStated, sources: [wait.where] })
  }
  return [...groups.values()]
}
