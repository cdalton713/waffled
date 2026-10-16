// One-way import of an AnyList account into Waffled's own tables: the grocery list's
// items, every other list, the Pantry list/section (as pantry items) and recipes with photos.
// Each imported AnyList id is recorded in import_links, so a re-run adds only what is
// new and never duplicates. Run it with `pnpm run anylist:import` (scripts/anylist-import.ts).
import { query } from '../../platform/db'
import { decryptSecret } from '../../platform/crypto'
import { getBlobStore, mediaKey } from '../../platform/storage'
import { updateModules } from '../../modules/persons/persons'
import { getOrCreateGroceryList, createList } from '../../modules/lists/lists.service'
import { parseQuantity } from '../../modules/lists/quantity'
import { aisleForCatalogCategory, waffledAisleForCategory } from '../../modules/lists/aisles'
import { createRecipe, updateRecipe } from '../../modules/meals/meals.service'
import { insertPantryItem } from '../../modules/pantry/pantry'
import type { Tenant } from '../../modules/households/households'
import type { IngredientInput } from '../../modules/meals/meals.types'
import { AnyListClient, downloadPhoto, photoUrl } from './client'
import { toLists, type AnyListItem, type AnyListList } from './mappers'
import type { PbRecipe, PbUserData } from './codec'

export interface ImportOptions {
  householdId: string
  // Who the import acts as (list ownership, recipe edits). Imported items carry no
  // "added by", since AnyList doesn't say who added them.
  personId: string
  // Omit both to use the sign-in saved by the AnyList module, if this database has one.
  email?: string
  password?: string
  // List names; default to the module's saved choice, then a list named like "Grocery"/"Pantry".
  groceryList?: string
  pantryList?: string
  dryRun?: boolean
}

interface Tally { created: number; skipped: number }
export interface ImportReport {
  dryRun: boolean
  groceryList: string | null
  pantryList: string | null
  lists: Tally
  items: Tally
  pantry: Tally
  recipes: Tally
  photosMissing: number
  pantryModuleEnabled: boolean
}

type Kind = 'list' | 'item' | 'pantry' | 'recipe'
const SOURCE = 'anylist'

// Data the AnyList module kept in Postgres alongside an account (which lists were the
// grocery/pantry choice, per-item store/priority/assignee, recipe extras).
interface LegacyMetadata { groceryListId: string | null; pantryListId: string | null; byExternalId: Map<string, Record<string, unknown>> }

async function savedCredentials(householdId: string): Promise<{ email: string; password: string } | null> {
  const { rows: [exists] } = await query<{ t: string | null }>(`select to_regclass('anylist_accounts')::text as t`)
  if (!exists?.t) return null
  const { rows } = await query<{ email: string; password_encrypted: string }>(
    'select email, password_encrypted from anylist_accounts where household_id = $1', [householdId])
  return rows[0] ? { email: rows[0].email, password: decryptSecret(rows[0].password_encrypted) } : null
}

async function legacyMetadata(householdId: string): Promise<LegacyMetadata> {
  const empty: LegacyMetadata = { groceryListId: null, pantryListId: null, byExternalId: new Map() }
  const { rows: [exists] } = await query<{ a: string | null; r: string | null }>(
    `select to_regclass('anylist_accounts')::text as a, to_regclass('anylist_resources')::text as r`)
  if (!exists?.a || !exists?.r) return empty
  const { rows } = await query<{ id: string; kind: string; external_id: string; metadata: Record<string, unknown> }>(
    `select r.id, r.kind, r.external_id, r.metadata from anylist_resources r
       join anylist_accounts a on a.household_id = r.household_id and a.anylist_user_id = r.account_id
      where r.household_id = $1`, [householdId])
  const externalOf = new Map(rows.map((r) => [r.id, r.external_id]))
  const settings = rows.find((r) => r.kind === 'settings')?.metadata ?? {}
  const pick = (key: string) => (typeof settings[key] === 'string' ? externalOf.get(settings[key] as string) ?? null : null)
  return {
    groceryListId: pick('groceryListId'),
    pantryListId: pick('pantryListId'),
    byExternalId: new Map(rows.filter((r) => r.kind !== 'settings').map((r) => [r.external_id, r.metadata])),
  }
}

async function linked(householdId: string): Promise<Set<string>> {
  const { rows } = await query<{ kind: string; external_id: string }>(
    'select kind, external_id from import_links where household_id = $1 and source = $2', [householdId, SOURCE])
  return new Set(rows.map((r) => `${r.kind}:${r.external_id}`))
}

async function link(householdId: string, kind: Kind, externalId: string, targetId: string): Promise<void> {
  await query(
    `insert into import_links (household_id, source, kind, external_id, target_id) values ($1, $2, $3, $4, $5)
     on conflict do nothing`, [householdId, SOURCE, kind, externalId, targetId])
}

function chooseList(lists: AnyListList[], byName: string | undefined, savedId: string | null, pattern: RegExp, exclude?: AnyListList): AnyListList | null {
  if (byName) {
    const found = lists.find((l) => l.name.trim().toLowerCase() === byName.trim().toLowerCase())
    if (!found) throw new Error(`No AnyList list named "${byName}". Lists: ${lists.map((l) => l.name).join(', ')}`)
    return found
  }
  return lists.find((l) => l.id === savedId && l !== exclude) ?? lists.find((l) => pattern.test(l.name) && l !== exclude) ?? null
}

// AnyList stores a system key ("dairy") or a category id on each item. "Other" means
// uncategorised, so it imports as no section and Waffled files the item by name.
function sectionOf(item: AnyListItem, list: AnyListList, grocery: boolean): string | null {
  const key = item.category
  if (!key || key === 'other') return null
  if (grocery && waffledAisleForCategory(key)) return waffledAisleForCategory(key)
  const name = list.categories.find((c) => c.matchId === key || c.id === key)?.name ?? aisleForCatalogCategory(key)
  return name?.toLowerCase() === 'other' ? null : name
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function splitQuantity(raw: string | null): { amount: number | null; unit: string | null } {
  const { n, unit } = parseQuantity(raw)
  // Only a plain number + word unit is structured; "a pinch" or "1 (14 oz) can" stays in display.
  return n != null && (!unit || /^[a-zA-Z .]+$/.test(unit)) ? { amount: n, unit: unit.trim() || null } : { amount: null, unit: null }
}

function ingredients(r: PbRecipe): IngredientInput[] {
  const out: IngredientInput[] = []
  let section: string | null = null
  for (const i of r.ingredients ?? []) {
    if (i.isHeading) { section = text(i.name) ?? text(i.rawIngredient); continue }
    const name = text(i.name) ?? text(i.rawIngredient)
    if (!name) continue
    const { amount, unit } = splitQuantity(text(i.quantity))
    const display = text(i.rawIngredient) ?? [i.quantity, i.note ? `${name}, ${i.note}` : name].filter(Boolean).join(' ')
    out.push({ name, amount, unit, prepNote: text(i.note), display, section, sortOrder: out.length })
  }
  return out
}

async function storePhoto(householdId: string, r: PbRecipe): Promise<{ storageKey: string; contentType: string } | null> {
  const url = r.photoIds?.[0] ? photoUrl(r.photoIds[0]) : r.photoUrls?.[0]
  if (!url) return null
  const photo = await downloadPhoto(url)
  if (!photo) return null
  const contentType = photo.contentType.split(';')[0].trim() || 'image/jpeg'
  const key = mediaKey(householdId, contentType)
  await getBlobStore().put(key, photo.bytes, contentType)
  return { storageKey: key, contentType }
}

const RECIPE_EXTRAS = ['emoji', 'description', 'category', 'tags', 'mealType', 'protein', 'base', 'cuisine', 'effort', 'cookMethod', 'flavorProfile', 'dietary', 'vegetables'] as const
const LEGACY_RECIPE_KEYS: Record<(typeof RECIPE_EXTRAS)[number], string> = {
  emoji: 'emoji', description: 'description', category: 'category', tags: 'tags', mealType: 'meal_type', protein: 'protein',
  base: 'base', cuisine: 'cuisine', effort: 'effort', cookMethod: 'cook_method', flavorProfile: 'flavor_profile',
  dietary: 'dietary', vegetables: 'vegetables',
}

export async function importAnyList(opts: ImportOptions): Promise<ImportReport> {
  const creds = opts.email && opts.password ? { email: opts.email, password: opts.password } : await savedCredentials(opts.householdId)
  if (!creds) throw new Error('No AnyList sign-in: pass --email and --password (or ANYLIST_EMAIL / ANYLIST_PASSWORD).')
  const client = await AnyListClient.signIn(creds.email, creds.password)
  const data: PbUserData = await client.getUserData()
  const legacy = await legacyMetadata(opts.householdId)
  const done = await linked(opts.householdId)
  const dry = opts.dryRun === true
  const tenant: Tenant = { sub: 'anylist-import', personId: opts.personId, householdId: opts.householdId, isAdmin: true, memberType: 'adult' }

  const lists = toLists(data)
  const grocery = chooseList(lists, opts.groceryList, legacy.groceryListId, /grocer|shopping/i)
  const pantry = chooseList(lists, opts.pantryList, legacy.pantryListId, /pantry/i, grocery ?? undefined)
  const report: ImportReport = {
    dryRun: dry, groceryList: grocery?.name ?? null, pantryList: pantry?.name ?? null,
    lists: { created: 0, skipped: 0 }, items: { created: 0, skipped: 0 }, pantry: { created: 0, skipped: 0 },
    recipes: { created: 0, skipped: 0 }, photosMissing: 0, pantryModuleEnabled: false,
  }
  const tally = (t: Tally, kind: Kind, id: string) => {
    const seen = done.has(`${kind}:${id}`)
    if (seen) t.skipped++
    else t.created++
    return !seen && !dry
  }

  const pantryItems = [...(pantry?.items ?? [])]
  for (const [position, list] of lists.entries()) {
    if (list === pantry) continue
    let targetListId: string | null = null
    if (list === grocery) {
      if (!dry) targetListId = (await getOrCreateGroceryList(tenant)).id
    } else if (tally(report.lists, 'list', list.id)) {
      targetListId = (await createList(tenant, { name: list.name.trim() || 'Untitled list', sortOrder: position })).id
      await link(opts.householdId, 'list', list.id, targetListId)
    } else if (!dry) {
      const { rows } = await query<{ target_id: string }>(
        `select target_id from import_links where household_id = $1 and source = $2 and kind = 'list' and external_id = $3`,
        [opts.householdId, SOURCE, list.id])
      targetListId = rows[0]?.target_id ?? null
    }
    for (const [index, item] of list.items.entries()) {
      if (!item.name.trim()) continue
      if (list === grocery && sectionOf(item, list, true)?.trim().toLowerCase() === 'pantry') {
        pantryItems.push(item)
        continue
      }
      if (!tally(report.items, 'item', item.id) || !targetListId) continue
      const meta = legacy.byExternalId.get(item.id) ?? {}
      // A crossed-off AnyList item is history: kept for suggestions, but off the live list.
      const { rows } = await query<{ id: string }>(
        `insert into list_items (household_id, list_id, name, quantity, note, category, store, priority, assigned_to, created_by,
                                 sort_order, checked, checked_at, deleted_at)
         values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 3), $9, $10, $11, $12,
                 case when $12 then now() end, case when $12 then now() end)
         returning id`,
        [opts.householdId, targetListId, item.name.trim(), item.quantity, item.details, sectionOf(item, list, list === grocery), text(meta.store),
          typeof meta.priority === 'number' ? meta.priority : null, await personIn(opts.householdId, meta.assignedTo),
          await personIn(opts.householdId, meta.createdBy), index, item.checked])
      await link(opts.householdId, 'item', item.id, rows[0].id)
    }
  }

  for (const item of pantryItems) {
    if (!item.name.trim()) continue
    const create = tally(report.pantry, 'pantry', item.id)
    if (dry) continue
    if (create) {
      const meta = (legacy.byExternalId.get(item.id)?.pantry ?? {}) as Record<string, unknown>
      const { n, unit } = parseQuantity(item.quantity)
      const split = n != null ? { amount: String(n), unit: unit.trim() || null } : { amount: item.quantity, unit: null }
      const row = await insertPantryItem(opts.householdId, {
        name: item.name.trim(), amount: text(meta.amount) ?? split.amount, unit: text(meta.unit) ?? split.unit,
        location: text(meta.location) ?? 'Pantry', expiresOn: text(meta.expiresOn), note: item.details,
      })
      if (item.checked) await query('update pantry_items set used_up_at = now() where id = $1', [row.id])
      await link(opts.householdId, 'pantry', item.id, row.id)
    }
    // Correct earlier imports only after the pantry copy is saved. Keep the link
    // so a later run cannot add the old shopping entry again.
    if (done.has(`item:${item.id}`)) {
      await query(
        `update list_items i set deleted_at = now()
          from import_links l, lists grocery
         where i.id = l.target_id and i.household_id = $1 and i.deleted_at is null
           and l.household_id = $1 and l.source = $2 and l.kind = 'item' and l.external_id = $3
           and grocery.id = i.list_id and grocery.household_id = $1 and grocery.list_type = 'grocery'`,
        [opts.householdId, SOURCE, item.id])
    }
  }
  if (!dry && report.pantry.created > 0) {
    await updateModules(opts.householdId, { pantry: true })
    report.pantryModuleEnabled = true
  }

  const collections = data.recipeDataResponse?.recipeCollections ?? []
  for (const r of data.recipeDataResponse?.recipes ?? []) {
    if (!tally(report.recipes, 'recipe', r.identifier)) continue
    const meta = legacy.byExternalId.get(r.identifier) ?? {}
    const photo = await storePhoto(opts.householdId, r)
    if (!photo && (r.photoIds?.length || r.photoUrls?.length)) report.photosMissing++
    const servings = parseInt(r.servings ?? '', 10)
    const extras = Object.fromEntries(RECIPE_EXTRAS.map((k) => [k, meta[LEGACY_RECIPE_KEYS[k]] ?? undefined]).filter(([, v]) => v !== undefined))
    const recipe = await createRecipe(tenant, {
      ...extras,
      title: r.name?.trim() || 'Untitled recipe',
      prepTimeMinutes: r.prepTime ? Math.round(r.prepTime / 60) : null,
      cookTimeMinutes: r.cookTime ? Math.round(r.cookTime / 60) : null,
      servings: Number.isFinite(servings) && servings > 0 ? servings : undefined,
      sourceName: text(r.sourceName),
      sourceUrl: text(r.sourceUrl),
      notes: text(r.note),
      collection: text(meta.collection) ?? collections.find((c) => c.recipeIds?.includes(r.identifier))?.name ?? null,
      storageKey: photo?.storageKey ?? null,
      contentType: photo?.contentType ?? null,
      imageUrl: photo ? null : (r.photoUrls?.[0] ?? null),
      ingredients: ingredients(r),
      steps: (r.preparationSteps ?? []).map((s) => s.trim()).filter(Boolean).map((instruction) => ({ instruction })),
    })
    if (r.rating || meta.is_favorite === true) {
      await updateRecipe(tenant, recipe.id, { ...(r.rating ? { rating: r.rating } : {}), ...(meta.is_favorite === true ? { isFavorite: true } : {}) })
    }
    await link(opts.householdId, 'recipe', r.identifier, recipe.id)
  }
  return report
}

async function personIn(householdId: string, id: unknown): Promise<string | null> {
  if (typeof id !== 'string') return null
  const { rows } = await query('select 1 from persons where household_id = $1 and id = $2 and deleted_at is null', [householdId, id])
  return rows.length ? id : null
}
