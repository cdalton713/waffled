// Offline list edits arriving through the PowerSync upload sink. Same rules as the REST
// routes (household scoping, canonical store casing, server-stamped checked_by/at), keyed
// on the client's ids. An op that can't apply — a blank name, another household's list,
// the Lists module switched off — is dropped rather than thrown, because PowerSync
// retries a failed transaction forever and one bad op would wedge the device's queue.
import { query } from '../../platform/db'
import { moduleEnabled } from '../../platform/modules'
import { type Tenant } from '../households/households'
import { canonicalStore, cleanNote, patchItem, softDeleteItem, softDeleteList, updateList } from '../lists/lists.service'
import type { PatchItemInput } from '../lists/lists.types'

export interface ListCrudOp {
  op: 'PUT' | 'PATCH' | 'DELETE'
  table: string
  id: string
  data?: Record<string, unknown>
}

// iOS sends every value as a string.
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true'
const int = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)))
const priority = (v: unknown): number => { const n = int(v); return n !== null && n >= 1 && n <= 5 ? n : 3 }

export async function listsModuleOn(tenant: Tenant): Promise<boolean> {
  const { rows } = await query<{ settings: unknown }>('select settings from households where id = $1', [tenant.householdId])
  return moduleEnabled(rows[0]?.settings, 'lists')
}

async function personOrNull(householdId: string, id: unknown): Promise<string | null> {
  const pid = str(id)
  if (!pid) return null
  const { rowCount } = await query('select 1 from persons where household_id = $1 and id = $2 and deleted_at is null', [householdId, pid])
  return rowCount ? pid : null
}

async function ownsItem(householdId: string, id: string): Promise<boolean> {
  const { rowCount } = await query('select 1 from list_items where household_id = $1 and id = $2', [householdId, id])
  return !!rowCount
}

async function putItem(tenant: Tenant, id: string, data: Record<string, unknown>): Promise<void> {
  const name = str(data.name)?.trim()
  const listId = str(data.list_id)
  if (!name || !listId) return
  const checked = bool(data.checked)
  await query(
    `insert into list_items (id, household_id, list_id, name, quantity, note, category, store, priority, assigned_to,
                             sort_order, checked, checked_at, checked_by, created_by)
     select $1, $2, l.id, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            case when $12 then now() end, case when $12 then $13::uuid end, $13
       from lists l where l.id = $3 and l.household_id = $2 and l.deleted_at is null
     on conflict (id) do update set
       name = excluded.name, quantity = excluded.quantity, note = excluded.note, category = excluded.category,
       store = excluded.store, priority = excluded.priority, assigned_to = excluded.assigned_to,
       sort_order = excluded.sort_order, checked = excluded.checked,
       checked_at = case when excluded.checked and not list_items.checked then now()
                         when excluded.checked then list_items.checked_at end,
       checked_by = case when excluded.checked and not list_items.checked then excluded.checked_by
                         when excluded.checked then list_items.checked_by end
     where list_items.household_id = $2`,
    [id, tenant.householdId, listId, name, str(data.quantity), cleanNote(data.note), str(data.category),
      await canonicalStore(tenant.householdId, str(data.store)), priority(data.priority),
      await personOrNull(tenant.householdId, data.assigned_to), int(data.sort_order), checked, tenant.personId]
  )
}

async function patchItemOp(tenant: Tenant, id: string, data: Record<string, unknown>): Promise<void> {
  if (!(await ownsItem(tenant.householdId, id))) return
  const patch: PatchItemInput = {}
  if ('checked' in data) patch.checked = bool(data.checked)
  if ('name' in data && str(data.name)?.trim()) patch.name = str(data.name)!.trim()
  if ('quantity' in data) patch.quantity = str(data.quantity)
  if ('note' in data) patch.note = str(data.note)
  if ('category' in data) patch.category = str(data.category)
  if ('store' in data) patch.store = str(data.store)
  if ('priority' in data) patch.priority = priority(data.priority)
  if ('assigned_to' in data) patch.assignedTo = await personOrNull(tenant.householdId, data.assigned_to)
  await patchItem(tenant, id, patch)
  if ('sort_order' in data) {
    await query('update list_items set sort_order = $3 where household_id = $1 and id = $2', [tenant.householdId, id, int(data.sort_order)])
  }
}

async function putList(tenant: Tenant, id: string, data: Record<string, unknown>): Promise<void> {
  const name = str(data.name)?.trim()
  if (!name) return
  await query(
    `insert into lists (id, household_id, name, emoji, list_type, is_auto_built, sort_order, created_by)
     values ($1, $2, $3, $4, 'custom', false, coalesce($5, 0), $6)
     on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, sort_order = excluded.sort_order
     where lists.household_id = $2 and lists.list_type = 'custom'`,
    [id, tenant.householdId, name, str(data.emoji), int(data.sort_order), tenant.personId]
  )
}

export async function applyListOp(tenant: Tenant, op: ListCrudOp): Promise<void> {
  const data = op.data ?? {}
  if (op.table === 'list_items') {
    if (op.op === 'PUT') await putItem(tenant, op.id, data)
    else if (op.op === 'PATCH') await patchItemOp(tenant, op.id, data)
    else if (op.op === 'DELETE') await softDeleteItem(tenant.householdId, op.id)
  } else if (op.table === 'lists') {
    if (op.op === 'PUT') await putList(tenant, op.id, data)
    else if (op.op === 'PATCH') {
      const patch: { name?: string; emoji?: string | null } = {}
      if ('name' in data && str(data.name)?.trim()) patch.name = str(data.name)!.trim()
      if ('emoji' in data) patch.emoji = str(data.emoji)
      await updateList(tenant.householdId, op.id, patch)
      if ('sort_order' in data) {
        await query('update lists set sort_order = coalesce($3, 0) where household_id = $1 and id = $2', [tenant.householdId, op.id, int(data.sort_order)])
      }
    } else if (op.op === 'DELETE') {
      // The grocery list is the household's one auto-built list; it is never deleted offline.
      const { rows } = await query<{ list_type: string }>('select list_type from lists where household_id = $1 and id = $2', [tenant.householdId, op.id])
      if (rows[0] && rows[0].list_type !== 'grocery') await softDeleteList(tenant.householdId, op.id)
    }
  }
}
