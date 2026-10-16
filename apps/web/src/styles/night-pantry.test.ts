// Night Pantry is read from across a kitchen and on a phone, in both light and dark,
// so its text pairs must clear WCAG AA and its shell sizing must stay off phones.
import postcss, { type AtRule, type Node, type Rule } from 'postcss'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileStyles, compiledStyle } from '../test/styles'

let root: ReturnType<typeof postcss.parse>
beforeAll(async () => {
  await compileStyles()
  root = postcss.parse(compiledStyle('night-pantry.css'))
})

function tokens(selector: RegExp): Record<string, string> {
  const out: Record<string, string> = {}
  root.walkRules((rule) => {
    if (!selector.test(rule.selector)) return
    rule.walkDecls((d) => {
      if (d.prop.startsWith('--')) out[d.prop] = d.value
    })
  })
  return out
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const lin = [16, 8, 0].map((s) => {
    const c = ((n >> s) & 255) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const LIGHT = /^:root\[data-palette=["']night-pantry["']\]$/
const DARK = /^:root\[data-palette=["']night-pantry["']\]\[data-theme=["']dark["']\]$/

// [text, surface] pairs every screen relies on. --on-accent is white on Latte and dark on
// Frappé, so every fill that carries it is checked in both.
const PAIRS: Array<[string, string]> = [
  ['--ink', '--bg'],
  ['--ink', '--card'],
  ['--ink-2', '--card'],
  ['--ink-2', '--bg'],
  ['--on-accent', '--primary'],
  ['--on-accent', '--success'],
  ['--on-accent', '--danger'],
  ['--on-accent', '--info'],
  ['--on-accent', '--ai'],
  ['--on-accent', '--person-1'],
  ['--on-accent', '--person-3'],
  ['--primary-d', '--card'],
  ['--rail-ink', '--rail'],
]

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('night-pantry.css %s', (_mode, selector) => {
  it('clears 4.5:1 for every text pair', () => {
    const t = { ...tokens(LIGHT), ...tokens(selector) }
    const failing = PAIRS.filter(([fg, bg]) => contrast(t[fg], t[bg]) < 4.5).map(
      ([fg, bg]) => `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`,
    )
    expect(failing).toEqual([])
  })
})

// Light is Catppuccin Latte, dark is Catppuccin Frappé (catppuccin.com/palette).
describe('night-pantry.css Catppuccin flavors', () => {
  it.each([
    ['Latte', LIGHT, { '--bg': '#dce0e8', '--card': '#eff1f5', '--ink': '#4c4f69', '--primary': '#8839ef' }],
    ['Frappé', DARK, { '--bg': '#232634', '--card': '#303446', '--ink': '#c6d0f5', '--primary': '#ca9ee6' }],
  ])('uses %s for the core tokens', (_flavor, selector, expected) => {
    const t = { ...tokens(LIGHT), ...tokens(selector) }
    const actual = Object.fromEntries(Object.keys(expected).map((k) => [k, t[k]]))
    expect(actual).toEqual(expected)
  })
})

describe('night-pantry.css touch targets', () => {
  // Compact controls that render under 44px in the base styles (found in QA on Today).
  it.each(['.ob-btn', '.chores-card-row'])('gives %s a 44px minimum height', (cls) => {
    let min: string | undefined
    root.walkRules((rule) => {
      if (rule.selector.includes(cls))
        rule.walkDecls('min-height', (d) => {
          min = d.value
        })
    })
    expect(min).toBe('44px')
  })
})

describe('night-pantry.css on a phone', () => {
  const SHELL = /\.(wf-kiosk|rail|rail-item|topbar|tb-date|tb-time)\b/
  const LAYOUT = /^(grid-template-columns|width|height|min-height|padding|gap|font-size)$/

  function insideTabletMedia(rule: Rule): boolean {
    for (let p = rule.parent as Node | undefined; p; p = p.parent as Node | undefined) {
      if (p.type === 'atrule' && /min-width:\s*721px/.test((p as AtRule).params)) return true
    }
    return false
  }

  it('scopes every shell sizing override to the tablet breakpoint', () => {
    const leaks: string[] = []
    root.walkRules((rule) => {
      if (!SHELL.test(rule.selector) || insideTabletMedia(rule)) return
      rule.walkDecls((d) => {
        if (LAYOUT.test(d.prop)) leaks.push(`${rule.selector} { ${d.prop} }`)
      })
    })
    expect(leaks).toEqual([])
  })
})
