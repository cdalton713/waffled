import { useState } from 'react'
import { WeekdayChips } from '@waffled/web'

export const RepeatsOnDays = () => {
  const [v, setV] = useState(['MO', 'WE', 'FR'])
  return <WeekdayChips value={v} weekday="MO" onChange={setV} />
}

export const SingleDayRhythm = () => {
  const [v, setV] = useState(['SA'])
  return <WeekdayChips value={v} weekday="SA" onChange={setV} single />
}

export const DefaultsToAnchorDay = () => {
  const [v, setV] = useState<string[]>([])
  return <WeekdayChips value={v} weekday="TH" onChange={setV} />
}
