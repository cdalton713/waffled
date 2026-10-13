// The grocery board offline: items come from the local replica, laid over the last
// board the server computed (meals, aisles, pantry hits), which is cached per week.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { publishSyncHealth, __resetSyncHealthForTests, type SyncHealthSnapshot } from '../powersync/sync-health'

const local = vi.hoisted(() => ({ cbs: [] as Array<(rows: unknown[]) => void> }))
vi.mock('../powersync/lists-local', async (orig) => {
  const actual = await orig<typeof import('../powersync/lists-local')>()
  return {
    ...actual,
    watchListItems: (_id: string, cb: (rows: unknown[]) => void) => { local.cbs.push(cb); return () => { local.cbs = local.cbs.filter((c) => c !== cb) } },
  }
})

import { overlayBoardItems, useGroceryBoard, type GroceryBoard, type ListItem } from './grocery'

const board: GroceryBoard = {
  list: { id: 'g', name: 'Grocery', emoji: '🛒', listType: 'grocery', isAutoBuilt: true, sortMode: 'manual', itemCount: 2 },
  weekStart: '2026-10-11',
  meals: [],
  staples: [],
  items: [
    { id: 'a', name: 'Tomatoes', quantity: '2', checked: false, checkedAt: null, section: null, sortOrder: 0, assignee: null, aisle: 'Produce', source: 'auto', sourceRecipeIds: ['r1'], weekStart: '2026-10-11', pantry: { name: 'Tomatoes', location: 'Fridge', amount: '1', unit: null } as never },
    { id: 'b', name: 'Soap', quantity: null, checked: false, checkedAt: null, section: null, sortOrder: 1, assignee: null, aisle: '', source: 'manual', sourceRecipeIds: [], weekStart: null },
  ],
}
const item = (p: Partial<ListItem> & { id: string; weekStart?: string | null }): ListItem & { weekStart?: string | null } => ({
  name: 'x', quantity: null, checked: false, checkedAt: null, section: null, sortOrder: null, assignee: null, ...p,
})

describe('overlayBoardItems', () => {
  it('keeps server aisles and pantry hits, takes edits and new rows from the replica, and drops other weeks', () => {
    const out = overlayBoardItems(board, [
      item({ id: 'a', name: 'Tomatoes', checked: true, weekStart: '2026-10-11' }),
      item({ id: 'c', name: 'Bread', section: 'Bakery', weekStart: null }),
      item({ id: 'd', name: 'Next week thing', weekStart: '2026-10-18' }),
    ])
    expect(out.items.map((i) => i.id)).toEqual(['a', 'c'])
    expect(out.items[0]).toMatchObject({ checked: true, aisle: 'Produce', sourceRecipeIds: ['r1'] })
    expect(out.items[0].pantry).toBeTruthy()
    expect(out.items[1]).toMatchObject({ name: 'Bread', aisle: 'Bakery', pantry: null })
  })
})

const trusted = { status: 'ok', hasSynced: true, lastSyncedAt: Date.now(), restartCount: 0, lastRestartAt: null } as SyncHealthSnapshot

describe('useGroceryBoard offline', () => {
  beforeEach(() => {
    __resetSyncHealthForTests()
    local.cbs = []
    localStorage.clear()
  })

  it('shows the cached board when the server is unreachable, with live replica items', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => board })) as unknown as typeof fetch
    const first = renderHook(() => useGroceryBoard())
    await waitFor(() => expect(first.result.current.board?.items).toHaveLength(2))
    first.unmount()

    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline') }) as unknown as typeof fetch
    publishSyncHealth(trusted)
    const { result } = renderHook(() => useGroceryBoard())
    await waitFor(() => expect(result.current.board?.items.map((i) => i.name)).toEqual(['Tomatoes', 'Soap']))
    expect(result.current.error).toBe(false)
    act(() => local.cbs.forEach((cb) => cb([
      { id: 'b', list_id: 'g', name: 'Soap', checked: 1, week_start: null, priority: 3 },
    ])))
    await waitFor(() => expect(result.current.board?.items.map((i) => [i.name, i.checked])).toEqual([['Soap', true]]))
  })
})
