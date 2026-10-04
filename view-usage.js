// Usage in the top bar: a small reading per account between the logo and Settings/Refresh, expanding on click into
// a panel with each window's percent used, next reset, and when and where it was read. Readings only, never estimates;
// a window whose reset has passed since the reading shows as unknown ("?").
import { ageLabel, fmtStamp, usageRows } from './core.js'
                                                       
import { escapeHtml as esc } from './markdown.js'
import { state } from './state.js'

// The provider colours used for the Claude/Codex tags; each dot sits beside its name or number, never alone.
const DOT                         = { 'claude-desktop': '#d97757', 'claude-laptop': '#d97757', codex: '#10a37f' }

// The most constraining window an account has a reading for (the highest percent used); null when every window's
// reset has passed since the reading.
function headline(row          ) {
  return row.windows.filter(w => w.usedPercent !== null).sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))[0] ?? null
}

function shortName(row          , rows            )         {
  if (row.account === 'codex') return 'Codex'
  const bothClaude = rows.filter(r => r.account !== 'codex' && r.reading).length > 1
  return bothClaude ? (row.account === 'claude-desktop' ? 'Claude D' : 'Claude L') : 'Claude'
}

function panelHtml(rows            , now        )         {
  const windowHtml = (w                             ) =>
    w.usedPercent === null
      ? `<div class="usage-window"><span class="usage-name">${esc(w.name)}</span>
          <span class="muted">reset at ${esc(fmtStamp(w.resetsAtMs ?? now, now))} has passed; use since then is unknown</span></div>`
      : `<div class="usage-window"><span class="usage-name">${esc(w.name)}</span>
          <span class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.max(0, w.usedPercent))}%"></span></span>
          <span>${esc(String(Math.round(w.usedPercent * 10) / 10))}% used</span>
          <span class="muted">${w.resetsAtMs !== null ? `resets ${esc(fmtStamp(w.resetsAtMs, now))}` : 'reset time not reported'}</span></div>`
  return `
    <div id="usage-panel" class="usage-panel card" role="region" aria-label="Usage details">
      ${rows
        .map(
          r => `<div class="usage-row">
            <div><span class="u-dot" style="background:${DOT[r.account]}"></span> <strong>${esc(r.label)}</strong>
              ${r.reading ? `<span class="muted small">read ${esc(fmtStamp(r.reading.observedAtMs, now))} on ${esc(r.reading.origin)} (${esc(ageLabel(r.reading.observedAtMs, now, true))} ago)</span>` : ''}</div>
            ${r.reading ? r.windows.map(windowHtml).join('') : `<div class="muted small">${esc(r.none)}</div>`}
          </div>`,
        )
        .join('')}
      <p class="muted small">Readings as each provider last reported them, not estimates: "used" is as of the time read.
        Codex is one account, shown from whichever machine read it most recently.</p>
    </div>`
}

export function renderUsageBar(usage                            , now        )         {
  if (!usage) return ''
  const rows = usageRows(usage, now)
  const shown = rows.filter(r => r.reading)
  if (shown.length === 0) return ''
  const chips = shown.map(r => {
    const w = headline(r)
    return { name: shortName(r, rows), account: r.account, text: w ? `${Math.round(w.usedPercent ?? 0)}%` : '?', said: w ? `${Math.round(w.usedPercent ?? 0)}% of ${w.name}` : 'reset passed, use unknown' }
  })
  const label = `Usage: ${chips.map(c => `${c.name} ${c.said}`).join('; ')}. ${state.usageOpen ? 'Hide' : 'Show'} details`
  return `
    <button type="button" class="usage-toggle" data-action="usage-toggle" aria-expanded="${state.usageOpen}" aria-controls="usage-panel" aria-label="${esc(label)}" title="Usage">
      ${chips.map(c => `<span class="u"><span class="u-dot" style="background:${DOT[c.account]}"></span><span class="u-name">${esc(c.name)}</span> ${esc(c.text)}</span>`).join('')}
      <span class="u-caret" aria-hidden="true">${state.usageOpen ? '▴' : '▾'}</span>
    </button>
    ${state.usageOpen ? panelHtml(rows, now) : ''}`
}
