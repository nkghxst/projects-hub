                                               

// White glyphs have at least 4.5:1 contrast on every swatch. A glyph also carries identity.
export const COLOURS = ['#254f78', '#685086', '#286457', '#87472e', '#7c4058', '#505d75']         
export const ICONS = ['orbit', 'wave', 'blocks', 'leaf', 'spark', 'mountain']         
const paths                         = {
  orbit: '<circle cx="160" cy="100" r="39"/><ellipse cx="160" cy="100" rx="88" ry="25" transform="rotate(-28 160 100)"/>',
  wave: '<path d="M65 100q24-58 48 0t48 0t48 0t48 0M65 125q24-58 48 0t48 0t48 0t48 0"/>',
  blocks: '<rect x="87" y="57" width="64" height="64" rx="12"/><rect x="163" y="86" width="64" height="64" rx="12"/><path d="M174 58h43M195 37v43"/>',
  leaf: '<path d="M98 147C70 64 158 45 226 51c-5 84-53 123-128 96Zm0 0 89-65M135 111l-4-32M165 85l35 3"/>',
  spark: '<path d="m160 38 15 43 45 19-45 18-15 44-16-44-44-18 44-19Z"/><path d="M231 45v27m-14-14h28M77 137v22m-11-11h22"/>',
  mountain: '<path d="m64 154 69-105 40 59 22-30 61 76ZM112 80l21 18 16-16M181 98l14 12 13-10"/>',
}

// Deliberately ignore group and cover. All interpolated SVG values come from finite registries.
export function projectArt(identity          )         {
  const colour = COLOURS.find(c => c === identity.colour) ?? COLOURS[0]
  const icon = ICONS.find(i => i === identity.icon) ?? ICONS[0]
  const paper = ['#b5ccda','#d7c9e9','#b3d1c0','#e5a180','#d7bcb4','#cbd0c8'][COLOURS.indexOf(colour)]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="320" height="200" fill="${paper}"/><g fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</g></svg>`
}
