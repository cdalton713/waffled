// AnyList wire format: protobuf (package pcov.proto) over multipart HTTP. pcov.json is
// the descriptor shipped in the unofficial anylist@0.8.5 npm package, converted to
// protobufjs v7 JSON with every "required" relaxed to optional so upstream schema drift
// can't fail a decode. Waffled only reads it, to import an account (scripts/anylist-import.ts).
import protobuf from 'protobufjs/light'
import schema from './pcov.json'

const root = protobuf.Root.fromJSON(schema as protobuf.INamespace)
const type = (name: string) => root.lookupType(`pcov.proto.${name}`)
const OBJECT_OPTS: protobuf.IConversionOptions = { longs: Number, enums: Number, defaults: false, arrays: false }

export interface PbItemQuantity { amount?: string; unit?: string; rawQuantity?: string }
export interface PbListItem {
  identifier: string
  listId?: string
  name?: string
  details?: string
  checked?: boolean
  recipeId?: string
  rawIngredient?: string
  category?: string
  userId?: string
  categoryMatchId?: string
  // Field 18: the plain-text quantity AnyList clients still write.
  deprecatedQuantity?: string
  quantityPb?: PbItemQuantity
}
export interface PbShoppingList { identifier: string; name?: string; items?: PbListItem[]; timestamp?: number; creator?: string; logicalClockTime?: number; allowsMultipleListCategoryGroups?: boolean; listItemSortOrder?: number; newListItemPosition?: number }
export interface PbListCategory { identifier: string; name?: string; systemCategory?: string; sortIndex?: number }
export interface PbListResponse {
  listId?: string
  categoryGroupResponses?: Array<{ categoryGroup?: { identifier?: string; categories?: PbListCategory[] } }>
}

export interface PbIngredient { identifier?: string; rawIngredient?: string; name?: string; quantity?: string; note?: string; isHeading?: boolean }
export interface PbRecipe {
  identifier: string
  timestamp?: number
  name?: string
  note?: string
  sourceName?: string
  sourceUrl?: string
  ingredients?: PbIngredient[]
  preparationSteps?: string[]
  photoIds?: string[]
  photoUrls?: string[]
  scaleFactor?: number
  rating?: number
  creationTimestamp?: number
  nutritionalInfo?: string
  cookTime?: number // seconds
  prepTime?: number // seconds
  servings?: string
  recipeDataId?: string
}
export interface PbRecipeCollection { identifier: string; timestamp?: number; name?: string; recipeIds?: string[] }

export interface PbUserData {
  shoppingListsResponse?: { newLists?: PbShoppingList[]; listResponses?: PbListResponse[]; orderedIds?: string[] }
  recipeDataResponse?: { recipeDataId?: string; recipes?: PbRecipe[]; recipeCollections?: PbRecipeCollection[] }
}

function decode<T>(name: string, buf: Uint8Array): T {
  const t = type(name)
  return t.toObject(t.decode(buf), OBJECT_OPTS) as T
}

export const decodeUserData = (buf: Uint8Array) => decode<PbUserData>('PBUserDataResponse', buf)
export const encodeUserData = (v: object) => {
  const t = type('PBUserDataResponse')
  return t.encode(t.fromObject(v)).finish()
}
