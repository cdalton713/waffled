import { render, screen, waitFor } from '@testing-library/react'
import { setViewOnly } from '../lib/viewOnly'
import { MemoryRouter, Routes, Route } from 'react-router'
import { PersonProfile } from './PersonProfile'

// The "Award stars" button lives in the profile body (near the balances card) and
// is gated by the reward.grant capability. A parent who holds it sees it; a kid
// (or anyone without it) does not.
const overview = {
  person: { id: 'p2', name: 'Lottie', avatarEmoji: '🦊', colorHex: '#E0794B', age: 7, memberType: 'kid' },
  activeGoals: 1, topStreak: 0, stars: 0,
  currencies: [{ key: 'stars', label: 'Stars', symbol: '⭐', color: '#f2b01e', isDefault: true }],
  balances: [{ currency: 'stars', balance: 3 }], goals: [], categoryBalance: [],
  insight: { lean: [], light: [], suggestions: [], text: 'Lottie is on a roll.' },
  recentLedger: [], redemptions: [], rewardShop: [], savingToward: null,
  streak: { days: 0, week: [] },
}

const lists = [
  { id: 'l-lottie', name: 'Lottie', emoji: '🦊', colorHex: '#E0794B', isPrivate: false, sortOrder: 1, members: [{ personId: 'p2', name: 'Lottie', avatarEmoji: '🦊', colorHex: '#E0794B' }], goalCount: 0 },
]

const me = (id: string, capabilities: string[]) => ({ id, name: 'Kevin', memberType: 'adult', isAdmin: false, capabilities })

function mockApi(person: unknown) {
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/persons/p2/overview')) return { ok: true, json: async () => overview }
    if (u.includes('/api/goal-lists')) return { ok: true, json: async () => ({ lists }) }
    if (u.includes('/api/conversions')) return { ok: true, json: async () => ({ conversions: [] }) }
    if (u.includes('/api/persons')) return { ok: true, json: async () => ({ persons: [overview.person] }) }
    if (u.includes('/api/household')) return { ok: true, json: async () => ({ provisioned: true, household: { id: 'h', name: 'Home', timezone: 'UTC', weekStart: 'sunday' }, person }) }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/person/p2']}>
      <Routes>
        <Route path="/person/:id" element={<PersonProfile />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PersonProfile spot-award gating', () => {
  it('Kiosk mode hides Award stars even for a reward.grant holder', async () => {
    mockApi(me('p3', ['reward.grant']))
    setViewOnly(true)
    try {
      renderProfile()
      expect((await screen.findAllByText(/Wally|Lottie|Kevin/)).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: /award stars/i })).toBeNull()
    } finally { setViewOnly(false) }
  })

  it('shows the Award stars button to a reward.grant holder', async () => {
    mockApi(me('p3', ['reward.grant']))
    renderProfile()
    expect(await screen.findByRole('button', { name: /award stars/i })).toBeInTheDocument()
  })

  it('blends the currency colour toward ink so the balance reads on any card', async () => {
    mockApi(me('p3', ['reward.grant']))
    renderProfile()
    expect(await screen.findByText('⭐ 3')).toHaveStyle({ color: 'color-mix(in srgb, #f2b01e 60%, var(--ink))' })
  })

  it('hides the Award stars button from someone without reward.grant', async () => {
    mockApi(me('p3', []))
    renderProfile()
    // wait until the profile has loaded (balance value renders)
    await waitFor(() => expect(screen.getByText(/Lottie is on a roll/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /award stars/i })).not.toBeInTheDocument()
  })
})
