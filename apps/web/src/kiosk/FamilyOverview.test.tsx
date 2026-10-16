import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FamilyOverview } from './FamilyOverview'

vi.mock('./topbar-slot', () => ({ useTopbarRight: () => {} }))
vi.mock('../lib/api', () => ({
  useFamilyOverview: () => ({
    loading: false,
    error: null,
    people: [
      {
        personId: 'p1',
        name: 'Wally',
        age: 9,
        avatarEmoji: '🙂',
        colorHex: null,
        activeGoals: 2,
        avgProgressPct: 40,
        stars: 12,
        topStreak: 0,
      },
    ],
  }),
}))

describe('FamilyOverview', () => {
  // --person-4 is a fill colour; on a dark card it fails contrast. Stars read as
  // the gold text token everywhere else (shop.css .shop-kid-bal).
  it('colours the star balance with the gold text token', () => {
    render(
      <MemoryRouter>
        <FamilyOverview />
      </MemoryRouter>,
    )
    expect(screen.getByText('12', { selector: '.fam-stat-n' })).toHaveStyle({
      color: 'var(--gold-d)',
    })
  })
})
