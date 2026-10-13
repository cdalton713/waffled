// Lists in the local PowerSync replica: live reads of lists and their items, and
// local-first writes that PowerSync uploads to /api/powersync/crud when online. Each
// write returns false/null when it can't happen locally (no replica, or the row hasn't
// synced yet) so the caller saves over REST instead — the same contract as events-local.
import { getPowerSyncDb, onPowerSyncRecreated } from './db'
import { dropTombstoned, tombstoneEvent } from './events-local'
import type { ListItem, ListSummary } from '../api/grocery'

export interface LocalItemRow {
  id: string
  list_id: string
  name: string
  quantity: string | null
  note: string | null
  checked: number
  checked_at: string | null
  category: string | null
  store: string | null
  priority: number | null
  sort_order: number | null
  source: string | null
  source_recipe_ids: string | null
  source_meal_ids: string | null
  week_start: string | null
  assigned_to: string | null
  created_by: string | null
  assignee_name: string | null
  assignee_avatar: string | null
  assignee_color: string | null
  creator_name: string | null
  creator_avatar: string | null
  creator_color: string | null
}

export interface LocalListRow {
  id: string
  name: string
  emoji: string | null
  list_type: string
  is_auto_built: number
  sort_mode: string | null
  item_count: number
}

const ITEMS_SQL = `
  select i.*, a.name as assignee_name, a.avatar_emoji as assignee_avatar, a.color_hex as assignee_color,
         c.name as creator_name, c.avatar_emoji as creator_avatar, c.color_hex as creator_color
    from list_items i
    left join persons a on a.id = i.assigned_to
    left join persons c on c.id = i.created_by
   where i.list_id = ?
   order by i.checked, i.sort_order is null, i.sort_order, i.created_at`

const LISTS_SQL = `
  select l.id, l.name, l.emoji, l.list_type, l.is_auto_built, l.sort_mode,
         (select count(*) from list_items i where i.list_id = l.id and not i.checked) as item_count
    from lists l
   order by l.list_type = 'grocery' desc, l.sort_order, l.created_at`

// uuid[] columns replicate as JSON text ("[...]") or Postgres array text ("{...}").
function idArray(v: string | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return v.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
  }
}

export function rowToListItem(r: LocalItemRow): ListItem {
  return {
    id: r.id,
    name: r.name,
    quantity: r.quantity,
    quantityInput: r.quantity,
    note: r.note,
    checked: !!r.checked,
    checkedAt: r.checked_at,
    section: r.category,
    store: r.store,
    priority: r.priority ?? 3,
    sortOrder: r.sort_order,
    source: r.source ?? 'manual',
    sourceRecipeIds: idArray(r.source_recipe_ids),
    sourceMealIds: idArray(r.source_meal_ids),
    assignee: r.assigned_to ? { personId: r.assigned_to, name: r.assignee_name, avatarEmoji: r.assignee_avatar, colorHex: r.assignee_color } : null,
    addedBy: r.created_by ? { personId: r.created_by, name: r.creator_name, avatarEmoji: r.creator_avatar, colorHex: r.creator_color } : null,
  }
}

export function rowToListSummary(r: LocalListRow): ListSummary {
  return {
    id: r.id, name: r.name, emoji: r.emoji, listType: r.list_type, isAutoBuilt: !!r.is_auto_built,
    sortMode: r.sort_mode ?? 'manual', itemCount: Number(r.item_count) || 0,
  }
}

// Live query that survives a PowerSync hard restart (re-arms on recreate, like
// watchAgendaRows). A no-op disposer when PowerSync isn't running.
function watchRows<T>(sql: string, params: unknown[], tables: string[], onRows: (rows: T[]) => void, onError?: (e: unknown) => void): () => void {
  let disposed = false
  let controller = new AbortController()
  const arm = () => {
    const db = getPowerSyncDb()
    if (!db) return
    controller = new AbortController()
    try {
      db.watch(sql, params, {
        onResult: (result) => onRows(dropTombstoned((result.rows?._array ?? []) as Array<T & { id: string }>)),
        onError: (e) => onError?.(e),
      }, { signal: controller.signal, tables })
    } catch (e) {
      onError?.(e)
    }
  }
  arm()
  const offRecreate = onPowerSyncRecreated(() => {
    if (disposed) return
    controller.abort()
    arm()
  })
  return () => {
    disposed = true
    offRecreate()
    controller.abort()
  }
}

export function watchListItems(listId: string, onRows: (rows: LocalItemRow[]) => void, onError?: (e: unknown) => void): () => void {
  return watchRows<LocalItemRow>(ITEMS_SQL, [listId], ['list_items', 'persons'], onRows, onError)
}

export function watchLists(onRows: (rows: LocalListRow[]) => void, onError?: (e: unknown) => void): () => void {
  return watchRows<LocalListRow>(LISTS_SQL, [], ['lists', 'list_items'], onRows, onError)
}

async function householdId(): Promise<string | null> {
  const db = getPowerSyncDb()
  if (!db) return null
  const res = await db.execute('select id as household_id from households limit 1')
  return (res.rows?._array?.[0] as { household_id?: string } | undefined)?.household_id ?? null
}

export interface LocalItemInput {
  name: string
  quantity?: string | null
  note?: string | null
  section?: string | null
  store?: string | null
  assignedTo?: string | null
  priority?: number
}

// Returns the new item's id, or null when it has to go over REST.
export async function addItemLocal(listId: string, input: LocalItemInput): Promise<string | null> {
  const db = getPowerSyncDb()
  const hh = await householdId()
  if (!db || !hh) return null
  const id = crypto.randomUUID()
  await db.execute(
    `insert into list_items (id, household_id, list_id, name, quantity, note, category, store, assigned_to, priority, checked, source, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'manual', ?)`,
    [id, hh, listId, input.name.trim(), input.quantity ?? null, input.note?.trim() || null, input.section ?? null,
      input.store ?? null, input.assignedTo ?? null, input.priority ?? 3, new Date().toISOString()]
  )
  return id
}

export interface LocalItemPatch {
  checked?: boolean
  name?: string
  quantity?: string | null
  note?: string | null
  section?: string | null
  store?: string | null
  assignedTo?: string | null
  priority?: number
}

export async function patchItemLocal(id: string, patch: LocalItemPatch): Promise<boolean> {
  const db = getPowerSyncDb()
  if (!db) return false
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.checked !== undefined) {
    sets.push('checked = ?', 'checked_at = ?')
    args.push(patch.checked ? 1 : 0, patch.checked ? new Date().toISOString() : null)
  }
  if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name.trim()) }
  if (patch.quantity !== undefined) { sets.push('quantity = ?'); args.push(patch.quantity) }
  if (patch.section !== undefined) { sets.push('category = ?'); args.push(patch.section) }
  if (patch.note !== undefined) { sets.push('note = ?'); args.push(patch.note?.trim() || null) }
  if (patch.store !== undefined) { sets.push('store = ?'); args.push(patch.store) }
  if (patch.assignedTo !== undefined) { sets.push('assigned_to = ?'); args.push(patch.assignedTo) }
  if (patch.priority !== undefined) { sets.push('priority = ?'); args.push(patch.priority) }
  if (!sets.length) return true
  const res = await db.execute(`update list_items set ${sets.join(', ')} where id = ?`, [...args, id])
  return (res.rowsAffected ?? 0) > 0
}

export async function deleteItemLocal(id: string): Promise<boolean> {
  const db = getPowerSyncDb()
  if (!db) return false
  const res = await db.execute('delete from list_items where id = ?', [id])
  if ((res.rowsAffected ?? 0) === 0) return false
  tombstoneEvent(id)
  return true
}

// Every id must already be local, or the whole reorder goes over REST.
export async function reorderLocal(ids: string[]): Promise<boolean> {
  const db = getPowerSyncDb()
  if (!db) return false
  let all = true
  await db.writeTransaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      const res = await tx.execute('update list_items set sort_order = ? where id = ?', [i, id])
      if ((res.rowsAffected ?? 1) === 0) all = false
    }
  })
  return all
}

export async function clearCheckedLocal(listId: string): Promise<boolean> {
  const db = getPowerSyncDb()
  if (!db) return false
  await db.execute('delete from list_items where list_id = ? and checked', [listId])
  return true
}

export async function createListLocal(input: { name: string; emoji?: string | null }): Promise<string | null> {
  const db = getPowerSyncDb()
  const hh = await householdId()
  if (!db || !hh) return null
  const id = crypto.randomUUID()
  await db.execute(
    `insert into lists (id, household_id, name, emoji, list_type, is_auto_built, sort_mode, sort_order, created_at)
     values (?, ?, ?, ?, 'custom', 0, 'manual', 0, ?)`,
    [id, hh, input.name.trim(), input.emoji ?? null, new Date().toISOString()]
  )
  return id
}

export async function renameListLocal(id: string, patch: { name?: string; emoji?: string | null }): Promise<boolean> {
  const db = getPowerSyncDb()
  if (!db) return false
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name.trim()) }
  if (patch.emoji !== undefined) { sets.push('emoji = ?'); args.push(patch.emoji) }
  if (!sets.length) return true
  const res = await db.execute(`update lists set ${sets.join(', ')} where id = ?`, [...args, id])
  return (res.rowsAffected ?? 0) > 0
}
