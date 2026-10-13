import { inkTint } from './ink-tint'

describe('inkTint', () => {
  // A user-picked colour (a currency's) as text: blended toward the theme's ink so it
  // stays readable on light and dark cards alike.
  it('blends a data colour toward the theme ink', () => {
    expect(inkTint('#7A52D6')).toBe('color-mix(in srgb, #7A52D6 60%, var(--ink))')
  })

  it('falls back to plain ink without a colour', () => {
    expect(inkTint(null)).toBe('var(--ink)')
  })
})
