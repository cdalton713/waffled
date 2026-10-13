// Offline list edits: lists + list_items replicate through PowerSync, and the upload
// sink (/api/powersync/crud) applies the queued row ops keyed on the client's ids.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './helpers/pg'
import { runMigrations } from '../src/migrate'

let pg: StartedPostgreSqlContainer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any
let closePool: () => Promise<void>
let query: typeof import('../src/platform/db').query
let token = ''
let personId = ''
let householdId = ''
let foreignListId = ''
let foreignPersonId = ''

function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  return app.run({
    httpMethod: method, path, headers, queryStringParameters: {},
    body: body !== undefined ? JSON.stringify(body) : null, isBase64Encoded: false,
  }, {}) as Promise<{ statusCode: number; body: string }>
}
const json = async (p: Promise<{ statusCode: number; body: string }>) => JSON.parse((await p).body)
const upload = (ops: unknown[]) => call('POST', '/api/powersync/crud', { ops })

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16').start()
  await runMigrations(pg.getConnectionUri())
  process.env.DATABASE_URL = pg.getConnectionUri()
  process.env.LOCAL_JWT_SECRET = 'waffled-local-dev-secret-change-me'
  delete process.env.AUTH0_DOMAIN
  app = (await import('../src/app')).default
  const db = await import('../src/platform/db')
  closePool = db.closePool
  query = db.query
  const setup = await call('POST', '/api/auth/setup', {
    household: { name: 'Offline', timezone: 'America/Chicago' },
    admin: { name: 'Alex', email: 'alex@example.com', password: 'ownerpass1' },
  })
  token = JSON.parse(setup.body).accessToken
  const me = await query<{ id: string; household_id: string }>('select id, household_id from persons limit 1')
  personId = me.rows[0].id
  householdId = me.rows[0].household_id
  const other = await query<{ id: string }>(`insert into households (name, timezone) values ('Other', 'UTC') returning id`)
  foreignPersonId = (await query<{ id: string }>(
    `insert into persons (household_id, name, member_type) values ($1, 'Stranger', 'adult') returning id`, [other.rows[0].id])).rows[0].id
  foreignListId = (await query<{ id: string }>(
    `insert into lists (household_id, name) values ($1, 'Theirs') returning id`, [other.rows[0].id])).rows[0].id
})

afterAll(async () => {
  await closePool?.()
  await pg?.stop()
})

describe('lists replication', () => {
  it('publishes lists and list_items with REPLICA IDENTITY FULL', async () => {
    const pub = await query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'powersync'`)
    expect(pub.rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(['lists', 'list_items']))
    const ident = await query<{ relreplident: string }>(
      `select relreplident from pg_class where relname in ('lists', 'list_items') and relkind = 'r'`)
    expect(ident.rows.map((r) => r.relreplident)).toEqual(['f', 'f'])
  })

  it('has a household-scoped sync rule for every published table', async () => {
    const rules = readFileSync(new URL('../../../infra/compose/powersync/sync-config.yaml', import.meta.url), 'utf8')
    const pub = await query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'powersync'`)
    for (const { tablename } of pub.rows) expect(rules).toMatch(new RegExp(`FROM ${tablename} WHERE`))
  })
})

describe('offline list edits', () => {
  let listId = ''
  const itemId = randomUUID()

  it('creates a custom list from a PUT with the client id', async () => {
    listId = randomUUID()
    expect((await upload([{ op: 'PUT', table: 'lists', id: listId, data: { name: 'Hardware', emoji: '🔧', sort_order: '3' } }])).statusCode).toBe(200)
    const lists = (await json(call('GET', '/api/lists'))).lists
    expect(lists.find((l: { id: string }) => l.id === listId)).toMatchObject({ name: 'Hardware', emoji: '🔧', listType: 'custom' })
  })

  it('adds an item from a PUT (string values as iOS sends them), idempotently', async () => {
    await call('POST', `/api/lists/${listId}/items`, { name: 'Bolts', store: 'Home Depot' })
    const op = { op: 'PUT', table: 'list_items', id: itemId, data: {
      list_id: listId, name: 'Screws', quantity: '1 box', note: 'wood', category: 'Fasteners', store: 'home depot',
      priority: '4', checked: '0', sort_order: '1',
    } }
    await upload([op])
    await upload([op])
    const items = (await json(call('GET', `/api/lists/${listId}`))).items
    const screws = items.filter((i: { id: string }) => i.id === itemId)
    expect(screws).toHaveLength(1)
    expect(screws[0]).toMatchObject({ name: 'Screws', quantity: '1 box', note: 'wood', section: 'Fasteners', store: 'Home Depot', priority: 4, checked: false })
    expect(screws[0].addedBy.personId).toBe(personId)
  })

  it('files an offline-added item without a section where it went last time', async () => {
    const first = (await json(call('POST', `/api/lists/${listId}/items`, { name: 'Tape', category: 'Supplies' }))).item
    await call('DELETE', `/api/list-items/${first.id}`)
    const id = randomUUID()
    await upload([{ op: 'PUT', table: 'list_items', id, data: { list_id: listId, name: 'tape' } }])
    const { rows } = await query<{ category: string }>('select category from list_items where id = $1', [id])
    expect(rows[0].category).toBe('Supplies')
  })

  it('applies a PATCH; the server stamps who checked it and when', async () => {
    await upload([{ op: 'PATCH', table: 'list_items', id: itemId, data: { checked: '1', note: 'deck screws', checked_by: foreignPersonId } }])
    const { rows } = await query<{ checked: boolean; checked_by: string; checked_at: Date | null; note: string }>(
      'select checked, checked_by, checked_at, note from list_items where id = $1', [itemId])
    expect(rows[0]).toMatchObject({ checked: true, checked_by: personId, note: 'deck screws' })
    expect(rows[0].checked_at).not.toBeNull()
  })

  it('applies a sort_order PATCH', async () => {
    await upload([{ op: 'PATCH', table: 'list_items', id: itemId, data: { sort_order: 0 } }])
    const { rows } = await query<{ sort_order: number }>('select sort_order from list_items where id = $1', [itemId])
    expect(rows[0].sort_order).toBe(0)
  })

  it('soft-deletes an item from a DELETE', async () => {
    await upload([{ op: 'DELETE', table: 'list_items', id: itemId }])
    const items = (await json(call('GET', `/api/lists/${listId}`))).items
    expect(items.map((i: { id: string }) => i.id)).not.toContain(itemId)
  })

  it('renames and deletes a list', async () => {
    await upload([{ op: 'PATCH', table: 'lists', id: listId, data: { name: 'Tools' } }])
    expect((await json(call('GET', '/api/lists'))).lists.find((l: { id: string }) => l.id === listId).name).toBe('Tools')
    await upload([{ op: 'DELETE', table: 'lists', id: listId }])
    expect((await json(call('GET', '/api/lists'))).lists.map((l: { id: string }) => l.id)).not.toContain(listId)
  })
})

describe('offline list edits that cannot apply are dropped, not errored', () => {
  it('drops a blank name, a foreign list and a foreign assignee, and applies the rest', async () => {
    const grocery = (await json(call('GET', '/api/lists/grocery'))).list.id
    const good = randomUUID()
    const res = await upload([
      { op: 'PUT', table: 'list_items', id: randomUUID(), data: { list_id: grocery, name: '   ' } },
      { op: 'PUT', table: 'list_items', id: randomUUID(), data: { list_id: foreignListId, name: 'Sneaky' } },
      { op: 'PUT', table: 'list_items', id: good, data: { list_id: grocery, name: 'Milk', assigned_to: foreignPersonId, priority: '9' } },
    ])
    expect(res.statusCode).toBe(200)
    const { rows } = await query<{ list_id: string; name: string; assigned_to: string | null; priority: number }>(
      'select list_id, name, assigned_to, priority from list_items where household_id = $1 or list_id = $2', [householdId, foreignListId])
    expect(rows.map((r) => r.name)).not.toContain('Sneaky')
    expect(rows.find((r) => r.name === 'Milk')).toMatchObject({ assigned_to: null, priority: 3 })
  })

  it('cannot turn a list into the grocery list or touch another household', async () => {
    const grocery = (await json(call('GET', '/api/lists/grocery'))).list.id
    await upload([{ op: 'DELETE', table: 'lists', id: grocery }, { op: 'PATCH', table: 'lists', id: foreignListId, data: { name: 'Mine now' } }])
    expect((await json(call('GET', '/api/lists'))).lists.map((l: { id: string }) => l.id)).toContain(grocery)
    const { rows } = await query<{ name: string }>('select name from lists where id = $1', [foreignListId])
    expect(rows[0].name).toBe('Theirs')
  })

  it('ignores list ops while the Lists module is off', async () => {
    await call('PATCH', '/api/household/modules', { lists: false })
    const id = randomUUID()
    const res = await upload([{ op: 'PUT', table: 'lists', id, data: { name: 'Nope' } }])
    expect(res.statusCode).toBe(200)
    expect((await query('select 1 from lists where id = $1', [id])).rowCount).toBe(0)
    await call('PATCH', '/api/household/modules', { lists: true })
  })
})
