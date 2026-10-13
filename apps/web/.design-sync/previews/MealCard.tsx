import { MealCard } from '@waffled/web'

const base = {
  isSaved: true,
  createdBy: null,
  createdAt: '2026-10-01T18:00:00Z',
  onHand: null,
  toBuy: 0,
  toBuyNames: [],
  recipes: [],
}

const tacoNight = { ...base, id: 'm1', name: 'Taco night', servings: 4, recipeCount: 3, emojis: ['🌮', '🥑', '🌽'], totalMinutes: 35 }
const sundayRoast = { ...base, id: 'm2', name: 'Sunday roast', servings: 6, recipeCount: 6, emojis: ['🍗', '🥔', '🥕', '🥦', '🍞', '🥧'], totalMinutes: 120 }

export const InLibrary = () => (
  <div style={{ width: 240 }}>
    <MealCard meal={tacoNight} onOpen={() => {}} />
  </div>
)

export const InSlotPicker = () => (
  <div style={{ width: 240 }}>
    <MealCard meal={sundayRoast} onOpen={() => {}} onSelect={() => {}} selectLabel="Put on Sunday" />
  </div>
)
