import { useState } from 'react'
import { TypefacePicker, WaffledRoot, SettingCard, type Typeface } from '@waffled/web'

export const Settings = () => {
  const [v, setV] = useState<Typeface>('classic')
  return (
    <WaffledRoot palette="kitchen" typeface={v}>
      <SettingCard>
        <div className="wf-serif" style={{ fontSize: 22, marginBottom: 4 }}>Typeface</div>
        <div className="tiny muted" style={{ marginBottom: 14 }}>Changes the lettering on this screen. Pick the one that's easiest to read from where you stand.</div>
        <TypefacePicker value={v} onChange={setV} />
      </SettingCard>
    </WaffledRoot>
  )
}

export const Compact = () => {
  const [v, setV] = useState<Typeface>('clear')
  return <TypefacePicker value={v} onChange={setV} compact />
}

export const ThreeChoices = () => {
  const [v, setV] = useState<Typeface>('hyperlegible')
  return (
    <TypefacePicker value={v} onChange={setV} options={['classic', 'clear', 'hyperlegible']}
      sample={{ clock: '7:05 AM', title: 'Soccer practice', body: 'Leave by 3:40 · Field 2' }} />
  )
}
