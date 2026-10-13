// Settings renders the grocery staple chips (Meals → Pantry Staples), whose styles live
// in grocery.css. That sheet otherwise loads only with the lazy grocery board, so
// without its own import the chips render as bare text and grey buttons.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Settings stylesheet imports', () => {
  it('loads grocery.css for the staple chips it renders', () => {
    const src = readFileSync(join(__dirname, 'Settings.tsx'), 'utf8')
    expect(src).toContain('staple-chip')
    expect(src).toMatch(/import '\.\.\/styles\/grocery\.css'/)
  })
})
