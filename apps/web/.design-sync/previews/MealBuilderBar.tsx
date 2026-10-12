import { useState } from 'react'
import { MealBuilderBar } from '@waffled/web'

const noop = () => {}

export const SavedPlate = () => {
  const [serves, setServes] = useState(4)
  const [saved, setSaved] = useState(true)
  return (
    <div style={{ width: 760 }}>
      <MealBuilderBar
        name="Sunday roast" servings={serves} totalMinutes={95} toBuy={6} isSaved={saved}
        empty={false} busy={false} onServings={setServes} onToggleSaved={() => setSaved((s) => !s)}
        onCook={noop} onAddToList={noop} onSchedule={noop}
      />
    </div>
  )
}

export const OneOffPicker = () => {
  const [serves, setServes] = useState(2)
  const [saved, setSaved] = useState(false)
  return (
    <div style={{ width: 760 }}>
      <MealBuilderBar
        name="Weeknight stir-fry" servings={serves} totalMinutes={25} toBuy={2} isSaved={saved}
        empty={false} busy={false} onServings={setServes} onToggleSaved={() => setSaved((s) => !s)}
        onUse={noop} useLabel="Put on Tuesday"
      />
    </div>
  )
}
