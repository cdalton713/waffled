import { useState } from 'react'
import { ColorPicker } from '@waffled/web'

export const PresetSelected = () => {
  const [c, setC] = useState<string | null>('#25A368')
  return <ColorPicker value={c} onChange={setC} />
}

export const CustomColor = () => {
  const [c, setC] = useState<string | null>('#C2410C')
  return <ColorPicker value={c} onChange={setC} />
}

export const Compact = () => {
  const [c, setC] = useState<string | null>('#2F7FED')
  return <ColorPicker value={c} onChange={setC} size={22} />
}
