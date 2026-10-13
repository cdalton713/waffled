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
    // Any max-width breakpoint at or above 720px also applies at phone width.
    const bp = /max-width:\s*(\d+)px/.exec(m.params)
    if (!bp || Number(bp[1]) < 720) return
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

  it('keeps the goal editor header on one line', () => {
    expect(phoneDecl('.ge-title', 'font-size', 'goals.css')).toBe('24px')
    expect(phoneDecl('.ge-topbar button', 'white-space', 'goals.css')).toBe('nowrap')
  })

  it('puts the profile person switcher on its own row', () => {
    expect(phoneDecl('.pp-topbar', 'flex-wrap', 'overview.css')).toBe('wrap')
    expect(phoneDecl('.pp-topbar .pp-switch', 'flex-basis', 'overview.css')).toBe('100%')
  })

  it('fits the Meals week grid and its gutters to a phone', () => {
    expect(phoneDecl('.meals-grid', 'grid-template-columns', 'meals.css')).toBe('22px repeat(7, minmax(0, 1fr))')
    expect(phoneDecl('.meals-screen', 'padding', 'meals.css')).toBe('0 16px 20px')
  })

  it('lets the meal builder flow and scroll as one page on a phone', () => {
    expect(phoneDecl('.mb-shell', 'height', 'mealbuilder.css')).toBe('auto')
    expect(phoneDecl('.mb-plate', 'max-height', 'mealbuilder.css')).toBe('none')
    expect(phoneDecl('.mb-body', 'padding', 'mealbuilder.css')).toBe('0 16px 16px')
  })

  it('keeps the recipe editor action buttons on one line', () => {
    expect(phoneDecl('.re-add-ing', 'white-space', 'recipe.css')).toBe('nowrap')
    expect(phoneDecl('.re-paste-bar .pill', 'white-space', 'recipe.css')).toBe('nowrap')
    expect(phoneDecl('.re-add-section', 'white-space', 'recipe.css')).toBe('nowrap')
  })

  it('wraps the grocery header: title, then full-width search, then the sort toggle', () => {
    expect(phoneDecl('.grocery-head', 'flex-wrap', 'grocery.css')).toBe('wrap')
    expect(phoneDecl('.grocery-head .lists-search-wrap', 'flex', 'grocery.css')).toBe('1 1 100%')
    expect(phoneDecl('.grocery-title', 'white-space', 'grocery.css')).toBe('nowrap')
  })

  it('stacks the lists rail above a single-column list on a phone', () => {
    expect(phoneDecl('.lists-home', 'grid-template-columns', 'lists.css')).toBe('minmax(0, 1fr)')
    expect(phoneDecl('.lists-head', 'flex-wrap', 'lists.css')).toBe('wrap')
    expect(phoneDecl('.lists-head-actions', 'flex-wrap', 'lists.css')).toBe('wrap')
    expect(phoneDecl('.lists-grid', 'grid-template-columns', 'lists.css')).toBe('minmax(0, 1fr)')
    expect(phoneDecl('.lists-addbar .lists-addbar-sec', 'max-width', 'lists.css')).toBe('112px')
  })

  it('uses the phone gutter on Photos', () => {
    expect(phoneDecl('.photos-wall-scroll', 'padding', 'photos.css')).toBe('0 16px 20px')
    expect(phoneDecl('.ph-empty', 'padding', 'photos.css')).toBe('32px 0')
  })

  it('wraps a settings row so a wide control drops under its label', () => {
    expect(phoneDecl('.set-row2', 'flex-wrap', 'settings.css')).toBe('wrap')
    expect(phoneDecl('.set-row2-b', 'flex', 'settings.css')).toBe('1 1 130px')
  })
})

describe('settings.css hand-rolled rows', () => {
  it('gives a row control its own full-width line on a phone, its segment scrolling', () => {
    expect(phoneDecl('.set-row2-ctl', 'flex', 'settings.css')).toBe('1 1 100%')
    expect(phoneDecl('.set-row2-ctl .seg', 'overflow-x', 'settings.css')).toBe('auto')
  })
})

describe('settings.css SSO form', () => {
  it('wraps a long redirect URI instead of spilling past the card', () => {
    const root = postcss.parse(readFileSync(join(__dirname, 'settings.css'), 'utf8'))
    let wrap: string | undefined
    root.walkRules('.sec-form code', (r) => r.walkDecls('overflow-wrap', (d) => { wrap = d.value }))
    expect(wrap).toBe('anywhere')
  })
})

describe('settings.css sticky section picker', () => {
  it('sticks flush to the scroller, cancelling the screen top padding', () => {
    expect(phoneDecl('.set-mobile-nav', 'top', 'settings.css')).toBe('-6px')
  })
})

describe('settings.css permission grid', () => {
  it('hyphenates the narrow column headers on a phone', () => {
    expect(phoneDecl('.perm-cap', 'hyphens', 'settings.css')).toBe('auto')
  })

  it('adds a column per permission instead of hard-coding six', () => {
    const root = postcss.parse(readFileSync(join(__dirname, 'settings.css'), 'utf8'))
    const decls: Record<string, string> = {}
    root.walkRules('.perm-row', (r) => {
      if (r.parent?.type === 'root') r.walkDecls((d) => { decls[d.prop] = d.value })
    })
    expect(decls['grid-template-columns']).toBe('1.2fr')
    expect(decls['grid-auto-flow']).toBe('column')
    expect(decls['grid-auto-columns']).toBe('minmax(0, 1fr)')
  })
})
