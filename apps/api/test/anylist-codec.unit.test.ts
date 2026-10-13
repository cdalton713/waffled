// AnyList protocol codec + mappers: pure decode against the vendored pcov schema.
import { describe, it, expect } from 'vitest'
import { encodeUserData, decodeUserData } from '../src/integrations/anylist/codec'
import { toLists, toRecipes, toCollections } from '../src/integrations/anylist/mappers'

const userData = {
  shoppingListsResponse: {
    newLists: [{
      identifier: 'list-1', name: 'Groceries',
      items: [
        { identifier: 'item-1', listId: 'list-1', name: 'Milk', checked: false, details: '2%', category: 'dairy', categoryMatchId: 'dairy', deprecatedQuantity: '1 gal' },
        { identifier: 'item-2', listId: 'list-1', name: 'Eggs', checked: true, quantityPb: { rawQuantity: '12' } },
      ],
    }],
    listResponses: [{
      listId: 'list-1',
      categoryGroupResponses: [{ categoryGroup: { identifier: 'g1', listId: 'list-1', name: 'Default', categories: [{ identifier: 'c1', name: 'Dairy', systemCategory: 'dairy', sortIndex: 2 }] } }],
    }],
  },
  recipeDataResponse: {
    recipeDataId: 'rd-1',
    recipes: [{
      identifier: 'r1', name: 'Pancakes', note: 'Fluffy', servings: '4', prepTime: 600, cookTime: 900, rating: 5,
      sourceName: 'Grandma', sourceUrl: 'https://example.com', photoIds: ['p'.repeat(32)], preparationSteps: ['Mix', 'Cook'],
      timestamp: 1730176540.5,
      ingredients: [
        { identifier: 'i0', name: 'Dry', isHeading: true },
        { identifier: 'i1', rawIngredient: '2 cups flour', name: 'flour', quantity: '2 cups' },
      ],
    }],
    recipeCollections: [{ identifier: 'col-1', name: 'Breakfast', recipeIds: ['r1'] }],
  },
}

describe('codec round trips', () => {
  it('user data survives encode/decode', () => {
    const decoded = decodeUserData(encodeUserData(userData))
    expect(decoded.shoppingListsResponse?.newLists?.[0]?.items?.[1]?.quantityPb?.rawQuantity).toBe('12')
    expect(decoded.recipeDataResponse?.recipes?.[0]?.timestamp).toBe(1730176540.5)
  })

})

describe('mappers', () => {
  const ud = decodeUserData(encodeUserData(userData))

  it('maps lists with items, quantities and categories', () => {
    const [list] = toLists(ud)
    expect(list).toMatchObject({ id: 'list-1', name: 'Groceries', itemCount: 2, uncheckedCount: 1 })
    expect(list.items[0]).toEqual({ id: 'item-1', listId: 'list-1', name: 'Milk', quantity: '1 gal', details: '2%', checked: false, category: 'dairy', recipeId: null })
    expect(list.items[1]).toMatchObject({ name: 'Eggs', quantity: '12', checked: true, details: null })
    expect(list.categories).toEqual([{ id: 'c1', name: 'Dairy', matchId: 'dairy', sortIndex: 2 }])
  })

  it('maps recipes with headings, minutes and photo urls', () => {
    const [r] = toRecipes(ud)
    expect(r).toMatchObject({
      id: 'r1', name: 'Pancakes', servings: '4', prepMinutes: 10, cookMinutes: 15, rating: 5,
      steps: ['Mix', 'Cook'], photoId: 'p'.repeat(32), collectionIds: ['col-1'],
    })
    expect(r.ingredients).toEqual([
      { id: 'i0', name: 'Dry', quantity: null, note: null, raw: null, isHeading: true },
      { id: 'i1', name: 'flour', quantity: '2 cups', note: null, raw: '2 cups flour', isHeading: false },
    ])
    expect(toCollections(ud)).toEqual([{ id: 'col-1', name: 'Breakfast', recipeIds: ['r1'] }])
  })

  it("orders lists the way the AnyList app does (orderedIds), unknown ids last", () => {
    const ordered = decodeUserData(encodeUserData({
      shoppingListsResponse: {
        orderedIds: ['b', 'a'],
        newLists: [{ identifier: 'c', name: 'Zed' }, { identifier: 'a', name: 'A' }, { identifier: 'b', name: 'B' }],
      },
    }))
    expect(toLists(ordered).map((l) => l.id)).toEqual(['b', 'a', 'c'])
  })



})
