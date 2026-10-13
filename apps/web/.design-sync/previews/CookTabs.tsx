import { useState } from 'react'
import { CookTabs } from '@waffled/web'

const plate = [
  { recipeId: 'r1', title: 'Roast chicken', emoji: '🍗', stepIndex: 3, total: 7, done: false },
  { recipeId: 'r2', title: 'Garlic mash', emoji: '🥔', stepIndex: 4, total: 4, done: true },
  { recipeId: 'r3', title: 'Glazed carrots', emoji: '🥕', stepIndex: 0, total: 5, done: false },
]

export const ThreeDishPlate = () => {
  const [i, setI] = useState(0)
  return (
    <div style={{ width: 720 }}>
      <CookTabs tabs={plate} activeIndex={i} onSelect={setI} />
    </div>
  )
}

export const TwoDishes = () => {
  const [i, setI] = useState(1)
  return (
    <div style={{ width: 520 }}>
      <CookTabs tabs={plate.slice(1)} activeIndex={i} onSelect={setI} />
    </div>
  )
}
