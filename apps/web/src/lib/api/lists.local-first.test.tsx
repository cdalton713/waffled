// Lists read from the local replica only while it is trusted (same rule as the
// calendar, see events.fallback.test.tsx); edits go local-first with a REST fallback.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { publishSyncHealth, __resetSyncHealthForTests, type SyncHealthSnapshot } from '../powersync/sync-health'

const local = vi.hoisted(() => ({
  itemCbs: [] as Array<(rows: unknown[]) => void>,
  listCbs: [] as Array<(rows: unknown[]) => void>,
  patchResult: true,
  patched: [] as unknown[],
}))
vi.mock('../powersync/lists-local', async (orig) => {
  const actual = await orig<typeof import('../powersync/lists-local')>()
  return {
    ...actual,
    watchListItems: (_id: string, cb: (rows: unknown[]) => void) => { local.itemCbs.push(cb); return () => { local.itemCbs = local.itemCbs.filter((c) => c !== cb) } },
    watchLists: (cb: (rows: unknown[]) => void) => { local.listCbs.push(cb); return () => { local.listCbs = local.listCbs.filter((c) => c !== cb) } },
    patchItemLocal: async (id: string, patch: unknown) => { local.patched.push([id, patch]); return local.patchResult },
  }
})

import { useListDetail, useLists, listWrites, type ListItem } from './grocery'

const trusted: SyncHealthSnapshot = { status: 'ok', hasSynced: true, lastSyncedAt: Date.now(), lastError: null, uploading: false, downloading: false, restarts: 0 } as unknown as SyncHealthSnapshot
const restItem = { id: 'rest', name: 'From REST', quantity: null, checked: false, checkedAt: null, section: null, sortOrder: 0, assignee: null }
const localRow = { id: 'loc', list_id: 'L', name: 'From replica', quantity: null, note: null, checked: 0, checked_at: null, category: null, store: null, priority: 3, sort_order: 0, source: 'manual', source_recipe_ids: null, source_meal_ids: null, week_start: null, assigned_to: null, created_by: null, assignee_name: null, assignee_avatar: null, assignee_color: null, creator_name: null, creator_avatar: null, creator_color: null }

const sent: Array<{ method: string; url: string }> = []
beforeEach(() => {
  __resetSyncHealthForTests()
  local.itemCbs = []; local.listCbs = []; local.patched = []; local.patchResult = true
  sent.length = 0
  globalThis.fetch = vi.fn(async (url: string, init?: { method?: string }) => {
    sent.push({ method: init?.method ?? 'GET', url: String(url) })
    if (String(url).endsWith('/api/lists/L')) return { ok: true, json: async () => ({ list: {}, items: [restItem] }) }
    if (String(url).endsWith('/api/lists')) return { ok: true, json: async () => ({ lists: [{ id: 'L', name: 'REST list', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 1 }] }) }
    return { ok: true, json: async () => ({ item: { ...restItem, checked: true } }) }
  }) as unknown as typeof fetch
})

describe('useListDetail', () => {
  it('keeps REST data when the replica is not trusted', async () => {
    const { result } = renderHook(() => useListDetail('L'))
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['rest']))
    act(() => local.itemCbs.forEach((cb) => cb([localRow])))
    expect(result.current.items.map((i) => i.id)).toEqual(['rest'])
  })

  it('lets a trusted replica drive', async () => {
    publishSyncHealth(trusted)
    const { result } = renderHook(() => useListDetail('L'))
    await waitFor(() => expect(local.itemCbs.length).toBe(1))
    act(() => local.itemCbs.forEach((cb) => cb([localRow])))
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['loc']))
  })
})

describe('useLists', () => {
  it('lets a trusted replica drive the rail', async () => {
    publishSyncHealth(trusted)
    const { result } = renderHook(() => useLists())
    await waitFor(() => expect(local.listCbs.length).toBe(1))
    act(() => local.listCbs.forEach((cb) => cb([{ id: 'L2', name: 'Local list', emoji: null, list_type: 'custom', is_auto_built: 0, sort_mode: 'manual', item_count: 2 }])))
    await waitFor(() => expect(result.current.lists.map((l) => l.name)).toEqual(['Local list']))
  })
})

describe('listWrites', () => {
  const item = { ...restItem, id: 'i1' } as ListItem
  it('writes locally and returns the optimistic item without calling REST', async () => {
    const updated = await listWrites.patchItem(item, { checked: true })
    expect(updated.checked).toBe(true)
    expect(local.patched).toEqual([['i1', { checked: true }]])
    expect(sent.some((s) => s.method === 'PATCH')).toBe(false)
  })

  it('falls back to REST when the row is not in the replica', async () => {
    local.patchResult = false
    await listWrites.patchItem(item, { checked: true })
    expect(sent.some((s) => s.method === 'PATCH' && s.url.endsWith('/api/list-items/i1'))).toBe(true)
  })
})
