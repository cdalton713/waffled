// One-way AnyList → Waffled import: lists, items, the Pantry list and recipes (with
// photos) land in Waffled's own tables, and a re-run adds only what is new.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './helpers/pg'
import { startFakeAnyList, PHOTO_ID, type FakeAnyList } from './helpers/fake-anylist'
import { runMigrations } from '../src/migrate'

const EMAIL = 'alex@example.com'
const PASSWORD = 'anylist-pass'

let pg: StartedPostgreSqlContainer
let fake: FakeAnyList
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any
let closePool: () => Promise<void>
let importAnyList: typeof import('../src/integrations/anylist/import').importAnyList
let query: typeof import('../src/platform/db').query
let token = ''
let householdId = ''
let personId = ''

function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const [rawPath, qs] = path.split('?')
  return app.run({
    httpMethod: method, path: rawPath, headers,
    queryStringParameters: qs ? Object.fromEntries(new URLSearchParams(qs)) : {},
    body: body !== undefined ? JSON.stringify(body) : null, isBase64Encoded: false,
  }, {}) as Promise<{ statusCode: number; body: string }>
}
const get = async (path: string) => JSON.parse((await call('GET', path)).body)

beforeAll(async () => {
  fake = await startFakeAnyList({ email: EMAIL, password: PASSWORD })
  process.env.ANYLIST_BASE_URL = fake.url
  process.env.ANYLIST_PHOTOS_BASE_URL = `${fake.url}/photos`
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'waffled-media-'))
  pg = await new PostgreSqlContainer('postgres:16').start()
  await runMigrations(pg.getConnectionUri())
  process.env.DATABASE_URL = pg.getConnectionUri()
  process.env.LOCAL_JWT_SECRET = 'waffled-local-dev-secret-change-me'
  delete process.env.AUTH0_DOMAIN
  app = (await import('../src/app')).default
  const db = await import('../src/platform/db')
  closePool = db.closePool
  query = db.query
  importAnyList = (await import('../src/integrations/anylist/import')).importAnyList
  const setup = await call('POST', '/api/auth/setup', {
    household: { name: 'Daltons', timezone: 'America/Chicago' },
    admin: { name: 'Christian', email: 'c@example.com', password: 'ownerpass1' },
  })
  token = JSON.parse(setup.body).accessToken
  const me = await query<{ id: string; household_id: string }>('select id, household_id from persons limit 1')
  personId = me.rows[0].id
  householdId = me.rows[0].household_id
})

afterAll(async () => {
  await closePool?.()
  await pg?.stop()
  await fake?.close()
})

describe('AnyList import', () => {
  it('previews counts without writing anything on a dry run', async () => {
    const report = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD, dryRun: true })
    expect(report).toMatchObject({
      dryRun: true,
      groceryList: 'Groceries',
      pantryList: 'Pantry',
      lists: { created: 1, skipped: 0 },
      items: { created: 5, skipped: 0 },
      pantry: { created: 2, skipped: 0 },
      recipes: { created: 2, skipped: 0 },
    })
    expect((await get('/api/recipes')).recipes).toHaveLength(0)
    expect(fake.photoFetches).toBe(0)
  })

  it('imports grocery items, other lists, the pantry and recipes', async () => {
    const report = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
    expect(report.recipes.created).toBe(2)

    // The AnyList grocery list fills Waffled's grocery list; blank names are skipped.
    const grocery = await get('/api/lists/grocery')
    const milk = grocery.items.find((i: { name: string }) => i.name === 'Milk')
    expect(milk).toMatchObject({ quantity: '1 gal', note: 'the blue cap one', section: 'Dairy & Chilled', checked: false })
    // AnyList aisles map onto Waffled's where they match, keep their name where they don't,
    // and "Other" is left for Waffled to file by name.
    const section = (name: string) => grocery.items.find((i: { name: string }) => i.name === name).section
    expect(section('Chips')).toBe('Snacks')
    expect(section('Foil')).toBeNull()
    // Crossed-off items are history, not clutter: kept, but off the live list.
    expect(grocery.items.map((i: { name: string }) => i.name)).not.toContain('Eggs')
    const { rows: eggs } = await query<{ checked: boolean; deleted_at: Date | null }>(
      `select checked, deleted_at from list_items where household_id = $1 and name = 'Eggs'`, [householdId])
    expect(eggs[0].checked).toBe(true)
    expect(eggs[0].deleted_at).not.toBeNull()

    const lists = (await get('/api/lists')).lists as Array<{ id: string; name: string; listType: string }>
    const camping = lists.find((l) => l.name === 'Camping')!
    expect(camping.listType).toBe('custom')
    expect(lists.map((l) => l.name)).not.toContain('Pantry')
    const campingItems = (await get(`/api/lists/${camping.id}`)).items
    expect(campingItems).toEqual([expect.objectContaining({ name: 'Tent stakes', section: 'Gear' })])

    // The Pantry list becomes pantry items (switching the module on); a checked one is used up.
    expect(report.pantryModuleEnabled).toBe(true)
    const pantry = (await get('/api/pantry')).items as Array<{ name: string; amount: string; unit: string; note: string; usedUp: boolean }>
    expect(pantry.find((p) => p.name === 'Rice')).toMatchObject({ amount: '2', unit: 'lb', note: 'jasmine', usedUp: false })
    expect(pantry.find((p) => p.name === 'Flour')).toMatchObject({ usedUp: true })

    // Recipes keep their fields, sections, steps and a locally stored photo.
    const recipes = (await get('/api/recipes')).recipes as Array<{ id: string; title: string; imageUrl: string | null }>
    const pancakes = recipes.find((r) => r.title === 'Pancakes')!
    expect(pancakes.imageUrl).toMatch(/^\/media\//)
    expect(existsSync(join(process.env.MEDIA_DIR!, pancakes.imageUrl!.replace(/^\/media\//, '')))).toBe(true)
    const full = await get(`/api/recipes/${pancakes.id}`)
    const detail = { ...full.recipe, ingredients: full.ingredients, steps: full.steps }
    expect(detail).toMatchObject({
      prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 4,
      sourceName: 'Grandma', notes: 'Double for guests', collection: 'Breakfast',
    })
    const { rows: [raw] } = await query<{ rating: string; source_url: string }>('select rating, source_url from recipes where id = $1', [pancakes.id])
    expect(raw).toEqual({ rating: '5', source_url: 'https://example.com/pancakes' })
    expect(detail.ingredients.map((i: { name: string; section: string | null }) => [i.name, i.section])).toEqual([
      ['flour', null], ['maple syrup', 'Topping'],
    ])
    expect(detail.ingredients[0]).toMatchObject({ amount: 2, unit: 'cups' })
    expect(detail.ingredients[1]).toMatchObject({ prepNote: 'warmed' })
    expect(detail.steps.map((s: { instruction: string }) => s.instruction)).toEqual(['Mix', 'Cook'])
    expect(fake.photoFetches).toBe(1)
  })

  it('adds only what is new on a re-run', async () => {
    fake.data.recipeDataResponse!.recipes!.push({ identifier: 'recipe-soup', name: 'Soup', photoIds: [PHOTO_ID.replace(/f/g, 'e')] })
    const report = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
    expect(report).toMatchObject({
      lists: { created: 0, skipped: 1 },
      items: { created: 0, skipped: 5 },
      pantry: { created: 0, skipped: 2 },
      recipes: { created: 1, skipped: 2 },
      photosMissing: 1,
    })
    expect((await get('/api/recipes')).recipes).toHaveLength(3)
    expect((await get('/api/lists')).lists.filter((l: { name: string }) => l.name === 'Camping')).toHaveLength(1)
  })

  it('rejects a wrong password with a clear error', async () => {
    await expect(importAnyList({ householdId, personId, email: EMAIL, password: 'nope' })).rejects.toThrow(/email or password/)
  })

  it('imports the grocery Pantry section into the pantry even without a separate Pantry list', async () => {
    const shopping = fake.data.shoppingListsResponse!
    const savedLists = shopping.newLists!
    const groceries = savedLists.find((list) => list.identifier === 'list-groceries')!
    const categories = shopping.listResponses![0].categoryGroupResponses![0].categoryGroup!.categories!
    shopping.newLists = savedLists.filter((list) => list.identifier !== 'list-pantry')
    groceries.items!.push(
      { identifier: 'item-oats', listId: 'list-groceries', name: 'Oats', category: 'c-pantry', deprecatedQuantity: '2 lb', details: 'rolled', checked: false },
      { identifier: 'item-sugar', listId: 'list-groceries', name: 'Sugar', category: 'pantry', checked: true },
    )
    categories.push({ identifier: 'c-pantry', name: ' pAnTrY ', systemCategory: 'pantry' })
    try {
      const preview = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD, dryRun: true })
      expect(preview).toMatchObject({ pantryList: null, pantry: { created: 2, skipped: 0 }, items: { created: 0, skipped: 5 } })
      expect((await get('/api/pantry')).items.map((item: { name: string }) => item.name)).not.toContain('Oats')

      const report = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
      expect(report.pantry).toEqual({ created: 2, skipped: 0 })
      const pantry = (await get('/api/pantry')).items
      expect(pantry).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'Oats', amount: '2', unit: 'lb', note: 'rolled', usedUp: false }),
        expect.objectContaining({ name: 'Sugar', usedUp: true }),
      ]))
      expect((await get('/api/lists/grocery')).items.map((item: { name: string }) => item.name)).not.toContain('Oats')

      const again = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
      expect(again.pantry).toEqual({ created: 0, skipped: 2 })
      expect((await get('/api/pantry')).items.filter((item: { name: string }) => item.name === 'Oats')).toHaveLength(1)
    } finally {
      shopping.newLists = savedLists
      groceries.items!.splice(-2)
      categories.pop()
    }
  })
  it.each([
    'soups-and-canned-goods', 'grains-pasta-and-sides', 'cooking-and-baking',
    'condiments-oils-and-salad-dressings', 'spices-and-seasonings',
  ])('imports the %s grocery category into the pantry', async (category) => {
    const groceries = fake.data.shoppingListsResponse!.newLists!.find((list) => list.identifier === 'list-groceries')!
    const categories = fake.data.shoppingListsResponse!.listResponses![0].categoryGroupResponses![0].categoryGroup!.categories!
    const name = `Pantry item ${category}`
    categories.push({ identifier: `category-${category}`, systemCategory: category, name: category.replaceAll('-', ' ') })
    groceries.items!.push({ identifier: `item-${category}`, listId: 'list-groceries', name, category, checked: false })
    try {
      const preview = await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD, dryRun: true })
      expect(preview.pantry.created).toBe(1)
      expect(preview.items.created).toBe(0)
      await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
      expect((await get('/api/pantry')).items).toEqual(expect.arrayContaining([expect.objectContaining({ name })]))
      expect((await get('/api/lists/grocery')).items.map((item: { name: string }) => item.name)).not.toContain(name)
    } finally {
      groceries.items!.pop()
      categories.pop()
    }
  })

  it('moves an item already imported into groceries when it belongs to the Pantry section', async () => {
    const groceries = fake.data.shoppingListsResponse!.newLists!.find((list) => list.identifier === 'list-groceries')!
    const item = { identifier: 'item-lentils', listId: 'list-groceries', name: 'Lentils', category: 'other', deprecatedQuantity: '3 cans', details: 'green', checked: false }
    groceries.items!.push(item)
    try {
      await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
      expect((await get('/api/lists/grocery')).items).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Lentils' })]))
      item.category = 'pantry'

      await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD, dryRun: true })
      expect((await get('/api/lists/grocery')).items).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Lentils' })]))
      expect((await get('/api/pantry')).items.map((entry: { name: string }) => entry.name)).not.toContain('Lentils')

      await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
      const grocery = (await get('/api/lists/grocery')).items.map((entry: { name: string }) => entry.name)
      expect(grocery).not.toContain('Lentils')
      expect(grocery).toContain('Milk')
      expect((await get('/api/pantry')).items).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'Lentils', amount: '3', unit: 'cans', note: 'green', usedUp: false }),
      ]))

      await importAnyList({ householdId, personId, email: EMAIL, password: PASSWORD })
      expect((await get('/api/pantry')).items.filter((entry: { name: string }) => entry.name === 'Lentils')).toHaveLength(1)
    } finally {
      groceries.items!.pop()
    }
  })
})

describe('./waffled admin import-anylist', () => {
  it('finds the only household and its owner, and prints what it would import', async () => {
    process.env.VITEST = '1'
    const { _cmds } = await import('../scripts/admin')
    const lines: string[] = []
    const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')) })
    const saved = process.argv
    process.argv = ['node', 'admin', 'import-anylist', '--email', EMAIL, '--password', PASSWORD, '--dry-run']
    try {
      await _cmds.importAnyList()
    } finally {
      process.argv = saved
      log.mockRestore()
    }
    const out = lines.join('\n')
    expect(out).toMatch(/Dry run/)
    expect(out).toMatch(/Recipes\s+0 new, 3 already imported/)
  })
})
