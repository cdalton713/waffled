// The Kitchen palette is sized for a 10.1" wall tablet. On a phone (≤720px,
// kiosk.css) the shell collapses to a header + drawer, so any Kitchen override that
// sizes the shell must be scoped to wider screens or it rebuilds the tablet rail
// inside a 393px viewport.
import postcss, { type AtRule, type Node, type Rule } from 'postcss'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileStyles, compiledStyle } from '../test/styles'

let root: ReturnType<typeof postcss.parse>
beforeAll(async () => {
  await compileStyles()
  root = postcss.parse(
    compiledStyle('kitchen.css').replace(/(\[[^\]=]+=)'([^']*)'(\])/g, '$1"$2"$3'),
  )
})

const SHELL =
  /\.(wf-kiosk|rail|rail-item|rail-switch|rail-switch-av|topbar|tb-date|tb-time|tb-wx)\b/
const LAYOUT =
  /^(grid-template-columns|width|height|min-height|padding|gap|font-size|border-radius|justify-content)$/

function insideTabletMedia(rule: Rule): boolean {
  for (
    let p: Node | undefined = rule.parent as Node | undefined;
    p;
    p = p.parent as Node | undefined
  ) {
    if (
      p.type === 'atrule' &&
      (p as AtRule).name === 'media' &&
      /min-width:\s*721px/.test((p as AtRule).params)
    )
      return true
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
        if (/\.seg button$/.test(r.selector))
          r.walkDecls('padding', (d) => {
            pad = d.value
          })
      })
    })
    expect(pad).toBe('8px')
  })
})

describe('kitchen.css buttons on a phone', () => {
  it('keeps a Kitchen button label on one line', () => {
    let ws: string | undefined
    root.walkAtRules('media', (m) => {
      if (!/max-width:\s*720px/.test(m.params)) return
      m.walkRules((r) => {
        if (r.selector.endsWith(' .btn'))
          r.walkDecls('white-space', (d) => {
            ws = d.value
          })
      })
    })
    expect(ws).toBe('nowrap')
  })
})

describe('kitchen.css re-skins hard-coded classic colours', () => {
  const kitchenRule = (sel: string) => {
    let found = false
    root.walkRules((r) => {
      if (r.selector === `:root[data-palette="kitchen"] ${sel}`) found = true
    })
    return found
  }
  it('gives the Reward Shop hero and reward thumbnails Kitchen colours', () => {
    expect(kitchenRule('.shop-hero')).toBe(true)
    expect(kitchenRule('.shop-thumb')).toBe(true)
  })
})
