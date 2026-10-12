import { useState } from 'react'
import { MultiSelect } from '@waffled/web'

const CUISINES = ['Italian', 'Mexican', 'Thai', 'Comfort food', 'Breakfast']

export const NoneSelected = () => {
  const [sel, setSel] = useState<string[]>([])
  return <MultiSelect label="Cuisine" options={CUISINES} selected={sel} onChange={setSel} />
}

export const FilterRow = () => {
  const [a, setA] = useState<string[]>(['Italian', 'Thai'])
  const [b, setB] = useState<string[]>([])
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <MultiSelect label="Cuisine" options={CUISINES} selected={a} onChange={setA} />
      <MultiSelect label="Cook" options={['Jerry', 'Elaine', 'George']} selected={b} onChange={setB} />
    </div>
  )
}
