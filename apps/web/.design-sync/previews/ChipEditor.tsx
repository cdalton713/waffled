import { useState } from 'react'
import { ChipEditor } from '@waffled/web'

export const Allergies = () => {
  const [items, setItems] = useState(['Peanuts', 'Shellfish'])
  return (
    <div style={{ width: 380 }}>
      <ChipEditor items={items} onChange={setItems} placeholder="Add an allergy…" color="#FDE2DC" />
    </div>
  )
}

export const FavoriteFoods = () => {
  const [items, setItems] = useState(['Mac & cheese', 'Tacos', 'Strawberries', 'Pancakes'])
  return (
    <div style={{ width: 380 }}>
      <ChipEditor items={items} onChange={setItems} placeholder="Add a favorite…" />
    </div>
  )
}

export const Empty = () => {
  const [items, setItems] = useState<string[]>([])
  return (
    <div style={{ width: 380 }}>
      <ChipEditor items={items} onChange={setItems} placeholder="Type and press Enter" />
    </div>
  )
}
