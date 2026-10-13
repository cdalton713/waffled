// List ergonomics borrowed from AnyList: item notes, name suggestions, recently crossed
// off, saved order within a section, and remembered sections.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './helpers/pg'
import { runMigrations } from '../src/migrate'

let pg: StartedPostgreSqlContainer
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
