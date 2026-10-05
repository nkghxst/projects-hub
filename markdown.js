// A small Markdown renderer for the records: everything is HTML-escaped first, then a fixed set of
// constructs is turned back into tags. No raw HTML from a record ever reaches the page.

                                                              
// Maps a link as written to where it goes; null draws the text alone.
                                                              

export function escapeHtml(text        )         {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Glossary terms (from memory/desktop/hub/glossary.md), explained on hover and on tap wherever they appear in text:
// whole words only, never inside code, a tag or a link's address. A lower-case term ("baton") also matches with a
// capital, as at the start of a sentence; anything else matches only as written. A term with meanings in more than one
// scope (two projects using one acronym) offers all of them, never just the last one listed (Codex M5 review).
                                                                             
let terms = new Map                ()
let termPattern                = null
export function setGlossary(entries        ) {
  terms = new Map()
  for (const e of entries) {
    const capital = e.term.charAt(0).toUpperCase() + e.term.slice(1)
    for (const key of e.term === e.term.toLowerCase() && capital !== e.term ? [e.term, capital] : [e.term]) terms.set(key, [...(terms.get(key) ?? []), e])
  }
  const words = [...terms.keys()].sort((a, b) => b.length - a.length).map(t => escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  termPattern = words.length > 0 ? new RegExp(`(?<![\\w-])(${words.join('|')})(?![\\w-])`, 'g') : null
}
export const glossaryEntries = (term        )         => terms.get(term) ?? []
// One line per meaning: "K2 (Projects hub): the check that …".
export const glossaryText = (entries        ) => entries.map(t => `${t.term}${t.scope ? ` (${t.scope})` : ''}: ${t.meaning}`).join('\n')

// Terms already marked in the Markdown being rendered: only a term's first use in a section is marked.
let marked                     = null

function withTerms(html        )         {
  if (!termPattern) return html
  const pattern = termPattern
  // Only the text between tags is touched, so attributes such as a link's address never change; nor is a link's
  // label, where a tap would both follow the link and explain the term.
  let inLink = false
  return html
    .split(/(<[^>]+>)/)
    .map((part, i) => {
      if (i % 2 === 1) {
        if (/^<a\s/.test(part)) inLink = true
        else if (part === '</a>') inLink = false
        return part
      }
      if (inLink) return part
      return part.replace(pattern, (word        ) => {
        const found = terms.get(word.replace(/&amp;/g, '&')) ?? []
        const term = found[0]?.term
        if (!term || marked?.has(term)) return word
        marked?.add(term)
        return `<abbr class="term" tabindex="0" role="button" aria-controls="term-pop" data-term="${escapeHtml(word.replace(/&amp;/g, '&'))}" title="${escapeHtml(glossaryText(found))}">${word}</abbr>`
      })
    })
    .join('')
}

// Inline: code spans verbatim; elsewhere links, bold and italics, then glossary terms.
export function inline(text        , resolve              )         {
  return text
    .split('`')
    .map((segment, i) => {
      if (i % 2 === 1) return `<code>${escapeHtml(segment)}</code>`
      let html = escapeHtml(segment)
      html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m        , label        , href        ) => {
        const target = resolve(href.replace(/&amp;/g, '&'))
        if (!target) return label
        return target.isInternal
          ? `<a href="${escapeHtml(target.href)}">${label}</a>`
          : `<a href="${escapeHtml(target.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      })
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      html = html.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      html = html.replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      return withTerms(html)
    })
    .join('')
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

// Draws one section: a term is marked at its first use inside it, however many blocks or lines draw it.
export function termsOnce   (draw         )    {
  if (marked) return draw()
  marked = new Set()
  try {
    return draw()
  } finally {
    marked = null
  }
}

export function renderMarkdown(md        , resolve              )         {
  return termsOnce(() => renderBlocks(md, resolve))
}

function renderBlocks(md        , resolve              )         {
  const lines = md.replace(/\r/g, '').split('\n')
  const out           = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
    } else if (trimmed.startsWith('```')) {
      const code           = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
    } else if (/^#{1,6}\s/.test(trimmed)) {
      const level = Math.min(6, (trimmed.match(/^#+/)?.[0].length ?? 1) + 2)
      out.push(`<h${level}>${inline(trimmed.replace(/^#+\s*/, ''), resolve)}</h${level}>`)
      i++
    } else if (trimmed.startsWith('|')) {
      const rows             = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        if (!cells.every(c => /^:?-+:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      out.push(
        '<table><thead><tr>' +
          (head ?? []).map(c => `<th>${inline(c, resolve)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map(r => `<tr>${r.map(c => `<td>${inline(c, resolve)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>',
      )
    } else if (trimmed.startsWith('>')) {
      const quote           = []
      while (i < lines.length && lines[i].trim().startsWith('>')) quote.push(lines[i++].trim().replace(/^>\s?/, ''))
      out.push(`<blockquote>${renderBlocks(quote.join('\n'), resolve)}</blockquote>`)
    } else if (LIST_ITEM.test(line)) {
      // Nested lists by indent; continuation lines join the item above.
      const items                                                      = []
      while (i < lines.length && lines[i].trim() !== '') {
        const m = lines[i].match(LIST_ITEM)
        if (m) {
          items.push({ depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2), ordered: /\d/.test(m[2]), text: m[3] })
        } else if (items.length > 0) {
          items[items.length - 1].text += ` ${lines[i].trim()}`
        }
        i++
      }
      const stack           = []
      let html = ''
      for (const item of items) {
        while (stack.length > item.depth + 1) html += `</li></${stack.pop()}>`
        if (stack.length === item.depth + 1) html += '</li>'
        while (stack.length < item.depth + 1) {
          const tag = item.ordered ? 'ol' : 'ul'
          stack.push(tag)
          html += `<${tag}>`
        }
        html += `<li>${inline(item.text, resolve)}`
      }
      while (stack.length > 0) html += `</li></${stack.pop()}>`
      out.push(html)
    } else {
      const para           = []
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !LIST_ITEM.test(lines[i]) &&
        !/^\s*(#{1,6}\s|```|\||>)/.test(lines[i])
      ) {
        para.push(lines[i++].trim())
      }
      out.push(`<p>${inline(para.join(' '), resolve)}</p>`)
    }
  }
  return out.join('\n')
}
