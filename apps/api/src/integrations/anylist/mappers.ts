// AnyList protobuf shapes -> plain DTOs the importer works from.
import type { PbUserData, PbListItem, PbIngredient } from './codec'

export interface AnyListItem {
  id: string
  listId: string
  name: string
  quantity: string | null
  details: string | null
  checked: boolean
  category: string | null
  recipeId: string | null
}
export interface AnyListCategory { id: string; name: string; matchId: string | null; sortIndex: number }
export interface AnyListList {
  id: string
  name: string
  itemCount: number
  uncheckedCount: number
  items: AnyListItem[]
  categories: AnyListCategory[]
}

export interface AnyListIngredient {
  id: string | null
  name: string | null
  quantity: string | null
  note: string | null
  raw: string | null
  isHeading: boolean
}
export interface AnyListRecipe {
  id: string
  name: string
  note: string | null
  sourceName: string | null
  sourceUrl: string | null
  servings: string | null
  prepMinutes: number | null
  cookMinutes: number | null
  rating: number | null
  nutrition: string | null
  ingredients: AnyListIngredient[]
  steps: string[]
  photoId: string | null
  photoUrl?: string | null
  collectionIds: string[]
}
export interface AnyListCollection { id: string; name: string; recipeIds: string[] }

const orNull = <T>(v: T | undefined | null | ''): T | null => (v === undefined || v === null || v === '' ? null : v)
const minutes = (seconds: number | undefined) => (seconds ? Math.round(seconds / 60) : null)

function toItem(it: PbListItem, listId: string): AnyListItem {
  return {
    id: it.identifier,
    listId: it.listId ?? listId,
    name: it.name ?? '',
    quantity: orNull(it.quantityPb?.rawQuantity) ?? orNull(it.deprecatedQuantity),
    details: orNull(it.details),
    checked: it.checked === true,
    category: orNull(it.category),
    recipeId: orNull(it.recipeId),
  }
}

export function toLists(ud: PbUserData): AnyListList[] {
  const responses = ud.shoppingListsResponse?.listResponses ?? []
  // newLists arrives in arbitrary order; orderedIds is the user's order in the app.
  const order = ud.shoppingListsResponse?.orderedIds ?? []
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  const sorted = [...(ud.shoppingListsResponse?.newLists ?? [])].sort((a, b) => rank(a.identifier) - rank(b.identifier))
  return sorted.map((l) => {
    const items = (l.items ?? []).map((it) => toItem(it, l.identifier))
    const groups = responses.find((r) => r.listId === l.identifier)?.categoryGroupResponses ?? []
    const categories = groups.flatMap((g) => g.categoryGroup?.categories ?? []).map((c) => ({
      id: c.identifier,
      name: c.name ?? '',
      matchId: orNull(c.systemCategory),
      sortIndex: c.sortIndex ?? 0,
    }))
    return {
      id: l.identifier,
      name: l.name ?? '',
      itemCount: items.length,
      uncheckedCount: items.filter((i) => !i.checked).length,
      items,
      categories,
    }
  })
}

export function toCollections(ud: PbUserData): AnyListCollection[] {
  return (ud.recipeDataResponse?.recipeCollections ?? []).map((c) => ({
    id: c.identifier,
    name: c.name ?? '',
    recipeIds: c.recipeIds ?? [],
  }))
}

function toIngredient(i: PbIngredient): AnyListIngredient {
  return {
    id: orNull(i.identifier),
    name: orNull(i.name),
    quantity: orNull(i.quantity),
    note: orNull(i.note),
    raw: orNull(i.rawIngredient),
    isHeading: i.isHeading === true,
  }
}

export function toRecipes(ud: PbUserData): AnyListRecipe[] {
  const collections = toCollections(ud)
  return (ud.recipeDataResponse?.recipes ?? []).map((r) => ({
    id: r.identifier,
    name: r.name ?? '',
    note: orNull(r.note),
    sourceName: orNull(r.sourceName),
    sourceUrl: orNull(r.sourceUrl),
    servings: orNull(r.servings),
    prepMinutes: minutes(r.prepTime),
    cookMinutes: minutes(r.cookTime),
    rating: r.rating || null,
    nutrition: orNull(r.nutritionalInfo),
    ingredients: (r.ingredients ?? []).map(toIngredient),
    steps: r.preparationSteps ?? [],
    photoId: r.photoIds?.[0] ?? null,
    photoUrl: r.photoUrls?.[0] ?? null,
    collectionIds: collections.filter((c) => c.recipeIds.includes(r.identifier)).map((c) => c.id),
  }))
}
