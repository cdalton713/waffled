import { MealCardBadge } from '@waffled/web'

const meal = (n: number) => ({
  id: `m${n}`, name: 'Plate', servings: 4, isSaved: true, createdBy: null, createdAt: '2026-10-01T00:00:00Z',
  recipeCount: n, emojis: [], totalMinutes: null, onHand: null, toBuy: 0, toBuyNames: [], recipes: [],
})

export const Counts = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <MealCardBadge meal={meal(2)} />
    <MealCardBadge meal={meal(3)} />
    <MealCardBadge meal={meal(5)} />
  </div>
)
