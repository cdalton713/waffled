import { expect, test, type Page } from '@playwright/test'

const person = {
  id: 'person-1',
  name: 'Alex',
  memberType: 'adult',
  isAdmin: true,
  avatarEmoji: 'A',
  colorHex: '#4f7f73',
  capabilities: ['chore.manage', 'chore.approve', 'goal.manage'],
}

// Every optional module on, so the gated routes actually render their screen
// instead of redirecting to Today — a redirect would never load the chunk, and the
// test would pass while proving nothing.
const modules = {
  pantry: true,
  chores: true,
  goals: true,
  meals: true,
  lists: true,
  familyNight: true,
  quotes: true,
}

const household = {
  id: 'household-1',
  name: 'Test Household',
  timezone: 'America/Denver',
  weekStart: 'sunday',
  location: null,
  ownerPersonId: person.id,
  settings: {
    modules,
    chores: { rewards: false },
    pantry: { showOnToday: false },
    familyNight: { showOnToday: false },
  },
}

const capabilities = ['chore.manage', 'chore.approve', 'reward.manage', 'goal.manage']
const permissionRow = Object.fromEntries(capabilities.map((capability) => [capability, false]))
const permissions = { adult: permissionRow, teen: permissionRow, kid: permissionRow }
const empty = {
  balances: [],
  chores: [],
  countdowns: [],
  currencies: [],
  entries: [],
  events: [],
  goals: [],
  groups: [],
  instances: [],
  items: [],
  lists: [],
  meals: [],
  members: [],
  people: [],
  persons: [],
  photos: [],
  recipes: [],
  rewards: [],
  suggestions: [],
}

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = empty

    if (path === '/api/auth/status') body = { initialized: true, methods: ['password'] }
    else if (path === '/api/auth/login')
      body = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 900 }
    else if (path === '/api/household')
      body = { provisioned: true, household, person, memberships: [], pendingInvites: [] }
    else if (path === '/api/household/settings') {
      body = {
        household,
        members: [
          {
            ...person,
            hasLogin: true,
            loginEmail: 'alex@example.test',
            hasPassword: true,
            hasPin: false,
            isOwner: true,
          },
        ],
      }
    } else if (path === '/api/persons') body = { persons: [person] }
    else if (path === '/api/permissions')
      body = { permissions, capabilities, roles: ['adult', 'teen', 'kid'] }
    else if (path === '/api/meals/week')
      body = {
        entries: [
          {
            id: 'entry-1',
            date: '2026-10-14',
            mealType: 'dinner',
            recipeId: 'recipe-1',
            title: null,
            cook: null,
            recipe: {
              title: 'Pasta bake',
              emoji: '🍝',
              imageUrl: null,
              cookTimeMinutes: 25,
              servings: 4,
            },
          },
        ],
      }
    else if (path === '/api/weather') body = { weather: null }
    else if (path === '/api/updates') body = { enabled: false, updateAvailable: false }
    else if (path === '/api/calendar/status') body = { connected: false, configured: false }
    else if (path === '/api/powersync/token') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'disabled in browser tests' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Welcome back')).toBeVisible()
  await page.locator('input[type="email"]').fill('alex@example.test')
  await page.locator('input[type="password"]').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('button', { name: 'Add anything… “Soccer Tue 4pm for Wally”' }),
  ).toBeVisible()
}

async function openAppearance(page: Page) {
  const sections = page.getByRole('combobox', { name: 'Settings section' })
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  if (await sections.isVisible()) {
    await sections.click()
    await page.getByRole('option', { name: 'Appearance', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-13T18:30:00-06:00'))
  await mockApi(page)
})

test('phone navigation closes on outside click and Escape restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  const opener = page.getByRole('button', { name: 'Open navigation' })
  await opener.click()
  const navigation = page.getByRole('dialog', { name: 'Navigation' })
  await expect(navigation).toBeVisible()
  await page.mouse.click(380, 450)
  await expect(navigation).toBeHidden()
  await expect(opener).toBeFocused()
  await opener.click()
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(opener).toBeFocused()
})

test('chore controls choose a person and Lucide icon while keeping saved values', async ({
  page,
}) => {
  const created: unknown[] = []
  await page.route('**/api/chores', async (route) => {
    created.push(route.request().postDataJSON())
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ instance: { id: 'instance-1' } }),
    })
  })
  await signIn(page)
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'New chore', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New chore' })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('Feed the dog').fill('Sweep the porch')
  await dialog.getByRole('combobox', { name: 'Who' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('option', { name: 'Alex', exact: true }).click()
  await dialog.getByRole('button', { name: 'Icon', exact: true }).click()
  await page.getByRole('button', { name: 'Cleaning', exact: true }).click()
  await dialog.getByRole('button', { name: 'Just once', exact: true }).click()
  await dialog.getByRole('button', { name: 'Add chore', exact: true }).click()
  await expect.poll(() => created.length).toBe(1)
  expect(created[0]).toMatchObject({
    title: 'Sweep the porch',
    personId: 'person-1',
    emoji: '🧹',
  })
})

test('dragging a meal onto an empty cell works through the nested Lucide icon', async ({
  page,
}) => {
  const writes: Array<{ method: string; body: unknown; url: string }> = []
  await page.route('**/api/meals/plan**', async (route) => {
    writes.push({
      method: route.request().method(),
      body: route.request().postDataJSON(),
      url: route.request().url(),
    })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entry: {} }),
    })
  })
  await signIn(page)
  await page.goto('/meals')
  const source = page.locator('[data-meal-slot][data-slot="2026-10-14|dinner"]')
  const target = page.locator(
    '[data-meal-slot][data-slot="2026-10-15|dinner"] svg[data-slot="icon"]',
  )
  await expect(source).toContainText('Pasta bake')
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[0]).toMatchObject({
    method: 'POST',
    body: { date: '2026-10-15', mealType: 'dinner', recipeId: 'recipe-1' },
  })
  expect(writes[1].method).toBe('DELETE')
  expect(writes[1].url).toContain('date=2026-10-14')
})

const themes = [
  { label: 'Classic', palette: 'classic', mode: 'light' },
  { label: 'Classic dark', palette: 'classic', mode: 'dark' },
  { label: 'Kitchen', palette: 'kitchen', mode: 'light' },
  { label: 'Kitchen night', palette: 'kitchen', mode: 'dark' },
]
const sizes = [
  { label: 'kiosk', width: 1280, height: 800 },
  { label: 'portrait', width: 768, height: 1024 },
  { label: 'phone', width: 390, height: 844 },
]

for (const size of sizes) {
  for (const theme of themes) {
    test(`${size.label}: ${theme.label} keeps the themed Settings layout`, async ({ page }) => {
      await page.setViewportSize(size)
      await signIn(page)
      await page.goto('/settings')
      await openAppearance(page)
      await page.getByRole('button', { name: theme.label, exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-palette', theme.palette)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.mode)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(
        `settings-${size.label}-${theme.palette}-${theme.mode}.png`,
        { animations: 'disabled', mask: [page.locator('.topbar-clock')] },
      )
    })
  }
}

for (const font of ['Classic', 'Clear', 'Hyperlegible', 'Friendly', 'Early reader']) {
  test(`typeface ${font} stays readable with the shared controls`, async ({ page }) => {
    await signIn(page)
    await page.goto('/settings')
    await openAppearance(page)
    await page.getByRole('radio', { name: font, exact: true }).click()
    await expect(page.getByRole('radio', { name: font, exact: true })).toBeChecked()
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByRole('radiogroup', { name: 'Typeface' })).toHaveScreenshot(
      `typeface-${font.toLowerCase().replaceAll(' ', '-')}.png`,
      { animations: 'disabled' },
    )
  })
}
