import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  current: null as null | { execute: ReturnType<typeof vi.fn>; writeTransaction: (fn: (tx: unknown) => Promise<void>) => Promise<void> },
}))
vi.mock('./db', () => ({
  getPowerSyncDb: () => db.current,
  onPowerSyncRecreated: () => () => {},
}))

import { rowToListItem, addItemLocal, patchItemLocal, deleteItemLocal, reorderLocal, createListLocal, type LocalItemRow } from './lists-local'

function fakeDb(rowsAffected = 1) {
  const execute = vi.fn(async (sql: string, _args?: unknown[]) => (sql.trim().startsWith('select') ? { rows: { _array: [{ household_id: 'h1' }] } } : { rowsAffected }))
  db.current = { execute, writeTransaction: async (fn) => fn({ execute }) }
  return execute
}

const row: LocalItemRow = {
  id: 'i1', list_id: 'L', name: 'Milk', quantity: '1 gal', note: 'blue cap', checked: 0, checked_at: null,
  category: 'Dairy', store: null, priority: 4, sort_order: 2, source: 'manual', source_recipe_ids: null,
  source_meal_ids: '["m1"]', week_start: null, assigned_to: 'p1', created_by: 'p2',
  assignee_name: 'Kelly', assignee_avatar: '🦊', assignee_color: '#EC6049', creator_name: 'Kevin', creator_avatar: '🐻', creator_color: null,
}

describe('rowToListItem', () => {
  it('maps a local row to the ListItem the screens use', () => {
    expect(rowToListItem(row)).toMatchObject({
      id: 'i1', name: 'Milk', quantity: '1 gal', note: 'blue cap', checked: false, section: 'Dairy', priority: 4, sortOrder: 2,
      sourceMealIds: ['m1'], sourceRecipeIds: [],
      assignee: { personId: 'p1', name: 'Kelly', avatarEmoji: '🦊' },
      addedBy: { personId: 'p2', name: 'Kevin' },
    })
    expect(rowToListItem({ ...row, checked: 1, assigned_to: null }).assignee).toBeNull()
  })
})

describe('local list writes', () => {
  beforeEach(() => { db.current = null })

  it('report false with no local database, so callers use REST', async () => {
    expect(await addItemLocal('L', { name: 'Eggs' })).toBeNull()
    expect(await patchItemLocal('i1', { checked: true })).toBe(false)
    expect(await deleteItemLocal('i1')).toBe(false)
  })

  it('inserts an item with a fresh client id', async () => {
    const execute = fakeDb()
    const id = await addItemLocal('L', { name: ' Eggs ', quantity: '12', note: 'large', section: 'Dairy' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const insert = execute.mock.calls.find(([sql]) => String(sql).includes('insert into list_items'))!
    expect(insert[1]).toEqual(expect.arrayContaining([id, 'h1', 'L', 'Eggs', '12', 'large', 'Dairy']))
  })

  it('maps a patch to columns, and reports a row that is not local yet', async () => {
    const execute = fakeDb()
    expect(await patchItemLocal('i1', { checked: true, section: 'Fruit', note: '' })).toBe(true)
    const [sql, args = []] = execute.mock.calls.at(-1)!
    expect(sql).toMatch(/update list_items set checked = \?, checked_at = \?, category = \?, note = \? where id = \?/)
    expect(args[0]).toBe(1)
    expect(args.slice(2)).toEqual(['Fruit', null, 'i1'])
    fakeDb(0)
    expect(await patchItemLocal('missing', { checked: true })).toBe(false)
  })

  it('writes a reorder as sort_order updates in one transaction', async () => {
    const execute = fakeDb()
    expect(await reorderLocal(['b', 'a'])).toBe(true)
    expect(execute.mock.calls.map(([, a]) => a)).toEqual([[0, 'b'], [1, 'a']])
  })

  it('creates a custom list locally', async () => {
    const execute = fakeDb()
    const id = await createListLocal({ name: 'Camping', emoji: '⛺' })
    const insert = execute.mock.calls.find(([sql]) => String(sql).includes('insert into lists'))!
    expect(insert[1]).toEqual(expect.arrayContaining([id, 'h1', 'Camping', '⛺']))
  })

  it('tombstones a local delete', async () => {
    fakeDb()
    expect(await deleteItemLocal('gone')).toBe(true)
  })
})
