// In-process stand-in for www.anylist.com and photos.anylist.com: password sign-in, the
// protobuf user-data read, recipe photos, and the public item catalog. Read-only, like
// the importer that talks to it.
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { encodeUserData, type PbUserData } from '../../src/integrations/anylist/codec'

export const PHOTO_ID = 'f'.repeat(32)
// The importer stores whatever bytes the photo host returns, so any bytes will do.
export const PHOTO_BYTES = Buffer.from('fake-jpeg-bytes')

export interface FakeAnyList {
  url: string
  data: PbUserData
  password: string
  logins: number
  dataReads: number
  photoFetches: number
  tagDataFetches: number
  close(): Promise<void>
}

async function form(req: IncomingMessage): Promise<FormData> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return new Request('http://fake', { method: 'POST', headers: { 'content-type': req.headers['content-type'] ?? '' }, body: Buffer.concat(chunks) }).formData()
}

export function seedUserData(): PbUserData {
  return {
    shoppingListsResponse: {
      orderedIds: ['list-groceries', 'list-pantry', 'list-camping'],
      newLists: [
        { identifier: 'list-camping', name: 'Camping', items: [
          { identifier: 'item-tent', listId: 'list-camping', name: 'Tent stakes', checked: false, category: 'Gear' },
        ] },
        { identifier: 'list-groceries', name: 'Groceries', items: [
          { identifier: 'item-milk', listId: 'list-groceries', name: 'Milk', checked: false, deprecatedQuantity: '1 gal', details: 'the blue cap one', category: 'dairy' },
          { identifier: 'item-chips', listId: 'list-groceries', name: 'Chips', checked: false, category: 'snacks' },
          { identifier: 'item-foil', listId: 'list-groceries', name: 'Foil', checked: false, category: 'other' },
          { identifier: 'item-eggs', listId: 'list-groceries', name: 'Eggs', checked: true, quantityPb: { rawQuantity: '12' } },
          { identifier: 'item-blank', listId: 'list-groceries', name: '   ', checked: false },
        ] },
        { identifier: 'list-pantry', name: 'Pantry', items: [
          { identifier: 'item-rice', listId: 'list-pantry', name: 'Rice', checked: false, deprecatedQuantity: '2 lb', details: 'jasmine' },
          { identifier: 'item-flour', listId: 'list-pantry', name: 'Flour', checked: true },
        ] },
      ],
      listResponses: [{ listId: 'list-groceries', categoryGroupResponses: [{ categoryGroup: { identifier: 'g1', categories: [
        { identifier: 'c-dairy', name: 'Dairy', systemCategory: 'dairy', sortIndex: 1 },
        { identifier: 'c-snacks', name: 'Snacks', systemCategory: 'snacks', sortIndex: 2 },
        { identifier: 'c-other', name: 'Other', systemCategory: 'other', sortIndex: 3 },
      ] } }] }],
    },
    recipeDataResponse: {
      recipeDataId: 'rd-1',
      recipes: [
        {
          identifier: 'recipe-pancakes', name: 'Pancakes', servings: '4 servings', prepTime: 600, cookTime: 900, rating: 5,
          note: 'Double for guests', sourceName: 'Grandma', sourceUrl: 'https://example.com/pancakes', photoIds: [PHOTO_ID],
          ingredients: [
            { identifier: 'ing-1', name: 'flour', quantity: '2 cups', rawIngredient: '2 cups flour' },
            { identifier: 'ing-h', name: 'Topping', isHeading: true },
            { identifier: 'ing-2', name: 'maple syrup', note: 'warmed', rawIngredient: 'maple syrup, warmed' },
          ],
          preparationSteps: ['Mix', 'Cook'],
        },
        { identifier: 'recipe-toast', name: 'Toast', ingredients: [{ identifier: 'ing-3', name: 'bread', quantity: '2 slices' }], preparationSteps: [] },
      ],
      recipeCollections: [{ identifier: 'col-breakfast', name: 'Breakfast', recipeIds: ['recipe-pancakes'] }],
    },
  }
}

// A slice of www.anylist.com/static/webapp/data/tag_data.json: the public item catalog
// behind AnyList's add-item autocomplete. Each entry is [displayName, popularity, …].
export const TAG_DATA = {
  tags: {
    'ground-beef': { displayName: 'Ground Beef', rootCategory: 'meat' },
    'beef-broth': { displayName: 'Beef Broth', rootCategory: 'soups-and-canned-goods' },
    'beef-jerky': { displayName: 'Beef Jerky', rootCategory: 'snacks' },
    'bananas': { displayName: 'Bananas', rootCategory: 'produce' },
    'banana-bread': { displayName: 'Banana Bread', rootCategory: 'bakery' },
    'milk': { displayName: 'Milk', rootCategory: 'dairy' },
  },
  autocompleteKeywords: {
    b: {
      beef: [['Beef Broth', 1, 2, 1], ['Ground Beef', 3, 3, 1], ['Beef Jerky', 1, -1, 1]],
      banana: [['Bananas', 5, 1, 1], ['Banana Bread', 0, 0, 1]],
    },
    m: { milk: [['Milk', 4, 1, 1]] },
  },
}

export async function startFakeAnyList(opts: { email: string; password: string }): Promise<FakeAnyList> {
  const access = new Set<string>()
  const server: Server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '', 'http://fake').pathname
    const json = (status: number, body: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
    try {
      if (req.method === 'GET' && path === '/static/webapp/data/tag_data.json') {
        fake.tagDataFetches++
        return json(200, TAG_DATA)
      }
      if (req.method === 'GET' && path.startsWith('/photos/')) {
        if (path !== `/photos/${PHOTO_ID}.jpg`) return json(404, {})
        fake.photoFetches++
        res.setHeader('content-type', 'image/jpeg')
        return res.end(PHOTO_BYTES)
      }
      if (req.method !== 'POST') return json(405, {})
      if (req.headers['x-anyleaf-api-version'] !== '3') return json(400, { error: 'api version header missing' })
      if (path === '/auth/token') {
        const f = await form(req)
        if (f.get('email') !== opts.email || f.get('password') !== fake.password) return json(401, { error: 'invalid' })
        fake.logins++
        const token = `access-${fake.logins}`
        access.add(token)
        return json(200, { access_token: token, refresh_token: `refresh-${fake.logins}`, user_id: 'a'.repeat(32) })
      }
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
      if (!access.has(bearer) || !req.headers['x-anyleaf-client-identifier']) return json(401, {})
      if (path === '/data/user-data/get') {
        fake.dataReads++
        res.setHeader('content-type', 'application/octet-stream')
        return res.end(Buffer.from(encodeUserData(fake.data)))
      }
      return json(404, {})
    } catch (e) {
      return json(500, { error: String(e) })
    }
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const fake: FakeAnyList = {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    data: seedUserData(),
    password: opts.password,
    logins: 0,
    dataReads: 0,
    photoFetches: 0,
    tagDataFetches: 0,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
  return fake
}
