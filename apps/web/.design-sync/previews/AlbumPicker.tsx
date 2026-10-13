import { useState } from 'react'
import { AlbumPicker } from '@waffled/web'

const ALBUMS = ['Beach week 2026', 'Birthdays', 'First day of school']

export const ExistingAlbum = () => {
  const [v, setV] = useState('Birthdays')
  return <div style={{ width: 320 }}><AlbumPicker value={v} onChange={setV} albums={ALBUMS} /></div>
}

export const NewAlbum = () => {
  const [v, setV] = useState('Halloween 2026')
  return <div style={{ width: 320 }}><AlbumPicker value={v} onChange={setV} albums={ALBUMS} /></div>
}
