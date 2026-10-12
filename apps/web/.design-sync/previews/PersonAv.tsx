import { PersonAv } from '@waffled/web'

export const Family = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <PersonAv size="md" person={{ name: 'Jerry', avatarEmoji: '🥣', colorHex: '#2F7FED' }} />
    <PersonAv size="md" person={{ name: 'Elaine', avatarEmoji: '💃', colorHex: '#EC4899' }} />
    <PersonAv size="md" person={{ name: 'George', avatarEmoji: '🍝', colorHex: '#E0A500' }} />
    <PersonAv size="md" person={{ name: 'Kramer', avatarEmoji: '🌀', colorHex: '#25A368' }} />
  </div>
)

export const SizesAndFallback = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <PersonAv size="sm" person={{ name: 'Jerry', avatarEmoji: '🥣', colorHex: '#2F7FED' }} />
    <PersonAv size="md" person={{ name: 'Jerry', avatarEmoji: '🥣', colorHex: '#2F7FED' }} />
    <PersonAv size="lg" person={{ name: 'Jerry', avatarEmoji: '🥣', colorHex: '#2F7FED' }} />
    <PersonAv size="lg" person={{ name: 'Guest' }} />
  </div>
)
