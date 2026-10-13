// Phone-width (≤720px) rules that keep screens inside a 393px viewport. Layout
// can't be measured in jsdom, so these pin the CSS that does it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss, { type AtRule } from 'postcss'
import { describe, expect, it } from 'vitest'

function phoneDecl(selector: string, prop: string, file = 'kiosk.css'): string | undefined {
  const root = postcss.parse(readFileSync(join(__dirname, file), 'utf8'))
  let value: string | undefined
  root.walkAtRules('media', (m: AtRule) => {
    if (!/max-width:\s*720px/.test(m.params)) return
    m.walkRules((r) => {
      if (!r.selectors.includes(selector)) return
      r.walkDecls(prop, (d) => { value = d.value })
    })
  })
  return value
}

describe('phone layout', () => {
  it('lets the Today actions and the capture bar shrink to the viewport', () => {
    expect(phoneDecl('.tb-today-actions', 'min-width')).toBe('0')
    expect(phoneDecl('.capture-trigger', 'min-width')).toBe('0')
    expect(phoneDecl('.cap-trigger-text', 'text-overflow')).toBe('ellipsis')
  })

  it('wraps the Getting started actions under the checklist', () => {
    expect(phoneDecl('.ob-bar', 'flex-wrap', 'onboarding.css')).toBe('wrap')
    expect(phoneDecl('.ob-bar-main', 'flex-basis', 'onboarding.css')).toBe('100%')
  })

  it('lays the drawer profile switch out as a row, outranking kiosk-profiles.css', () => {
    expect(phoneDecl('.rail .rail-switch', 'flex-direction')).toBe('row')
  })
})
