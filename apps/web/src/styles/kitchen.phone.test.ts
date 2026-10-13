// The Kitchen palette is sized for a 10.1" wall tablet. On a phone (≤720px,
// kiosk.css) the shell collapses to a header + drawer, so any Kitchen override that
// sizes the shell must be scoped to wider screens or it rebuilds the tablet rail
// inside a 393px viewport.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss, { type AtRule, type Node, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'kitchen.css'), 'utf8')
const root = postcss.parse(css)

const SHELL = /\.(wf-kiosk|rail|rail-item|rail-switch|rail-switch-av|topbar|tb-date|tb-time|tb-wx)\b/
const LAYOUT = /^(grid-template-columns|width|height|min-height|padding|gap|font-size|border-radius|justify-content)$/

function insideTabletMedia(rule: Rule): boolean {
  for (let p: Node | undefined = rule.parent as Node | undefined; p; p = p.parent as Node | undefined) {
    if (p.type === 'atrule' && (p as AtRule).name === 'media' && /min-width:\s*721px/.test((p as AtRule).params)) return true
  }
  return false
}

describe('kitchen.css on a phone', () => {
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

  it('tightens segmented-control padding on phones so five tabs fit', () => {
    let pad: string | undefined
    root.walkAtRules('media', (m) => {
      if (!/max-width:\s*720px/.test(m.params)) return
      m.walkRules((r) => {
        if (/\.seg button$/.test(r.selector)) r.walkDecls('padding', (d) => { pad = d.value })
      })
    })
    expect(pad).toBe('8px')
  })
})
