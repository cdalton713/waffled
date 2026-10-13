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
