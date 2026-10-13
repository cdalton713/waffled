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

  it('wraps the Calendar view toggle and period nav onto full-width rows', () => {
    expect(phoneDecl('.cal-topbar', 'flex-wrap', 'calendar.css')).toBe('wrap')
    expect(phoneDecl('.cal-topbar .seg', 'width', 'calendar.css')).toBe('100%')
    expect(phoneDecl('.cal-topbar .seg button', 'flex', 'calendar.css')).toBe('1')
  })

  it('lets the month grid shrink to the phone width', () => {
    expect(phoneDecl('.cal-dow', 'grid-template-columns')).toBe('repeat(7, minmax(0, 1fr))')
    expect(phoneDecl('.cal-grid', 'grid-template-columns')).toBe('repeat(7, minmax(0, 1fr))')
    expect(phoneDecl('.cal-month', 'grid-template-columns', 'calendar.css')).toBe('minmax(0, 1fr)')
  })

  it('gives the Tasks header phone gutters and wraps its title onto its own row', () => {
    expect(phoneDecl('.tasks-head', 'flex-wrap')).toBe('wrap')
    expect(phoneDecl('.tasks-head', 'padding')).toBe('6px 16px 8px')
    expect(phoneDecl('.tasks-head > .card-h', 'flex-basis')).toBe('100%')
    expect(phoneDecl('.tasks-datenav', 'padding')).toBe('0 16px 10px')
  })

  it('wraps the Goals list header so its actions drop below the title', () => {
    expect(phoneDecl('.goal-listhead', 'flex-wrap', 'goals.css')).toBe('wrap')
  })
})
