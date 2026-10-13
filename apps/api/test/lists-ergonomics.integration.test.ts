// List ergonomics borrowed from AnyList: item notes, name suggestions, recently crossed
// off, saved order within a section, and remembered sections.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './helpers/pg'
import { runMigrations } from '../src/migrate'
import { startFakeAnyList, type FakeAnyList } from './helpers/fake-anylist'

let pg: StartedPostgreSqlContainer
let fake: FakeAnyList
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any
let closePool: () => Promise<void>
let token = ''

function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const [rawPath, qs] = path.split('?')
  return app.run({
    httpMethod: method,
    path: rawPath,
    headers,
    queryStringParameters: qs ? Object.fromEntries(new URLSearchParams(qs)) : {},
    body: body !== undefined ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  }, {}) as Promise<{ statusCode: number; body: string }>
}
const json = async (p: Promise<{ statusCode: number; body: string }>) => JSON.parse((await p).body)

beforeAll(async () => {
  // Stands in for www.anylist.com's public item catalog behind the suggestions.
  fake = await startFakeAnyList({ email: 'x@example.com', password: 'x' })
  process.env.ANYLIST_BASE_URL = fake.url
  pg = await new PostgreSqlContainer('postgres:16').start()
  await runMigrations(pg.getConnectionUri())
  process.env.DATABASE_URL = pg.getConnectionUri()
  process.env.LOCAL_JWT_SECRET = 'waffled-local-dev-secret-change-me'
  delete process.env.AUTH0_DOMAIN
  app = (await import('../src/app')).default
  closePool = (await import('../src/platform/db')).closePool
  const setup = await call('POST', '/api/auth/setup', {
    household: { name: 'Ergo', timezone: 'America/Chicago' },
    admin: { name: 'Alex', email: 'alex@example.com', password: 'ownerpass1' },
  })
  expect(setup.statusCode).toBe(201)
  token = JSON.parse(setup.body).accessToken
})

afterAll(async () => {
  await closePool?.()
  await pg?.stop()
  await fake?.close()
})

async function newList(name: string): Promise<string> {
  return (await json(call('POST', '/api/lists', { name }))).list.id
}

describe('item notes', () => {
  it('stores a note on add, edits it, and clears it', async () => {
    const listId = await newList('Notes')
    const added = await call('POST', `/api/lists/${listId}/items`, { name: 'Milk', note: '  the blue cap one ' })
    expect(added.statusCode).toBe(201)
    const item = JSON.parse(added.body).item
    expect(item.note).toBe('the blue cap one')

    const edited = await json(call('PATCH', `/api/list-items/${item.id}`, { note: 'organic' }))
    expect(edited.item.note).toBe('organic')

    const cleared = await json(call('PATCH', `/api/list-items/${item.id}`, { note: '   ' }))
    expect(cleared.item.note).toBeNull()

    const detail = await json(call('GET', `/api/lists/${listId}`))
    expect(detail.items[0].note).toBeNull()
  })

  it('accepts a note on the grocery add route', async () => {
    const res = await json(call('POST', '/api/lists/grocery/items', { name: 'Eggs', note: 'large' }))
    expect(res.item.note).toBe('large')
  })
})

describe('item name suggestions', () => {
  let listId = ''
  beforeAll(async () => {
    listId = await newList('Suggest')
    const other = await newList('Elsewhere')
    // Bought three times before (now crossed off and cleared), once from another list.
    for (let i = 0; i < 3; i++) {
      const it = (await json(call('POST', `/api/lists/${listId}/items`, { name: 'Bagels' }))).item
      await call('PATCH', `/api/list-items/${it.id}`, { checked: true })
      await call('DELETE', `/api/list-items/${it.id}`)
    }
    await call('POST', `/api/lists/${other}/items`, { name: 'Banana peppers' })
    await call('POST', `/api/lists/${listId}/items`, { name: 'Bandages' })
  })

  it('ranks names the household has used ahead of the catalog, most-used first', async () => {
    const res = await json(call('GET', `/api/lists/suggestions?q=ba&listId=${listId}`))
    const names = res.suggestions.map((s: { name: string }) => s.name)
    expect(names.slice(0, 2)).toEqual(['Bagels', 'Banana peppers'])
    expect(res.suggestions[0].source).toBe('history')
    // Catalog fills in after history (Bananas is the most popular catalog "ba" match).
    expect(names).toContain('Bananas')
    expect(res.suggestions.find((s: { name: string }) => s.name === 'Bananas').source).toBe('catalog')
  })

  it('leaves out what is already on the list', async () => {
    const res = await json(call('GET', `/api/lists/suggestions?q=band&listId=${listId}`))
    expect(res.suggestions.map((s: { name: string }) => s.name)).not.toContain('Bandages')
  })

  it('offers the most-bought items not on the list when nothing is typed', async () => {
    const res = await json(call('GET', `/api/lists/suggestions?listId=${listId}`))
    expect(res.suggestions[0]).toEqual({ name: 'Bagels', source: 'history' })
    expect(res.suggestions.map((s: { name: string }) => s.name)).not.toContain('Bandages')
  })
})

describe('remembered sections', () => {
  it('files a re-added item into the section it was in last time on that list', async () => {
    const listId = await newList('Packing')
    const first = (await json(call('POST', `/api/lists/${listId}/items`, { name: 'Sunscreen', category: 'Gear' }))).item
    await call('DELETE', `/api/list-items/${first.id}`)
    const again = (await json(call('POST', `/api/lists/${listId}/items`, { name: 'sunscreen ' }))).item
    expect(again.section).toBe('Gear')
  })

  it('learns from moving an item, and an explicit section still wins', async () => {
    const listId = await newList('Moves')
    const it1 = (await json(call('POST', `/api/lists/${listId}/items`, { name: 'Rope' }))).item
    await call('PATCH', `/api/list-items/${it1.id}`, { category: 'Tools' })
    await call('DELETE', `/api/list-items/${it1.id}`)
    expect((await json(call('POST', `/api/lists/${listId}/items`, { name: 'Rope' }))).item.section).toBe('Tools')
    expect((await json(call('POST', `/api/lists/${listId}/items`, { name: 'Rope', category: 'Gear' }))).item.section).toBe('Gear')
  })

  it('gives new grocery items an aisle from the item catalog', async () => {
    const add = async (name: string) => (await json(call('POST', '/api/lists/grocery/items', { name }))).item.section
    expect(await add('Bananas')).toBe('Produce')
    expect(await add('beef jerky')).toBe('Snacks')
    expect(await add('Mystery thing')).toBeNull()
  })
})

describe('recently crossed off', () => {
  let listId = ''
  beforeAll(async () => {
    listId = await newList('Recent')
    const add = async (name: string, extra: Record<string, unknown> = {}) =>
      (await json(call('POST', `/api/lists/${listId}/items`, { name, ...extra }))).item
    const cross = async (id: string) => call('PATCH', `/api/list-items/${id}`, { checked: true })
    const apples = await add('Apples', { quantity: '6', note: 'honeycrisp', category: 'Fruit' })
    await cross(apples.id)
    await call('POST', `/api/lists/${listId}/clear-completed`)
    const bread = await add('Bread')
    await cross(bread.id)
    const apples2 = await add('apples')
    await cross(apples2.id)
    await add('Bread') // back on the list, so not "recent"
  })

  it('lists crossed-off items newest first, one per name, skipping what is on the list', async () => {
    const res = await json(call('GET', `/api/lists/${listId}/recent`))
    expect(res.items.map((i: { name: string }) => i.name)).toEqual(['apples'])
  })

  it('re-adds a cleared item with its quantity, note and section', async () => {
    const { rows } = await (await import('../src/platform/db')).query<{ id: string }>(
      `select id from list_items where list_id = $1 and name = 'Apples' and deleted_at is not null`, [listId])
    const res = await call('POST', `/api/list-items/${rows[0].id}/readd`)
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).item).toMatchObject({ name: 'Apples', quantity: '6', note: 'honeycrisp', section: 'Fruit', checked: false })
  })

  it('re-adding a still-visible crossed-off item just unchecks it', async () => {
    const recent = (await json(call('GET', `/api/lists/${listId}/recent`))).items
    expect(recent).toEqual([])
    const detail = await json(call('GET', `/api/lists/${listId}`))
    const crossed = detail.items.find((i: { name: string; checked: boolean }) => i.name === 'apples' && i.checked)
    const res = await json(call('POST', `/api/list-items/${crossed.id}/readd`))
    expect(res.item).toMatchObject({ id: crossed.id, checked: false })
  })
})

describe('saved order', () => {
  it('keeps the order items are dragged into, and new items go last', async () => {
    const listId = await newList('Order')
    const ids: string[] = []
    for (const name of ['A', 'B', 'C']) ids.push((await json(call('POST', `/api/lists/${listId}/items`, { name }))).item.id)
    const res = await call('PUT', `/api/lists/${listId}/order`, { ids: [ids[2], ids[0], ids[1]] })
    expect(res.statusCode).toBe(200)
    await call('POST', `/api/lists/${listId}/items`, { name: 'D' })
    const names = (await json(call('GET', `/api/lists/${listId}`))).items.map((i: { name: string }) => i.name)
    expect(names).toEqual(['C', 'A', 'B', 'D'])
  })

  it('rejects ids that are not on the list', async () => {
    const listId = await newList('Order2')
    const other = await newList('Other2')
    const foreign = (await json(call('POST', `/api/lists/${other}/items`, { name: 'X' }))).item.id
    expect((await call('PUT', `/api/lists/${listId}/order`, { ids: [foreign] })).statusCode).toBe(400)
    expect((await call('PUT', `/api/lists/${listId}/order`, { ids: 'nope' })).statusCode).toBe(400)
  })
})
