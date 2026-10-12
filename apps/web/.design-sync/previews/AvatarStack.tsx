import { AvatarStack } from '@waffled/web'

const family = [
  { personId: 'p1', name: 'Jerry', avatarEmoji: '🥣', colorHex: '#2F7FED' },
  { personId: 'p2', name: 'Elaine', avatarEmoji: '💃', colorHex: '#EC4899' },
  { personId: 'p3', name: 'George', avatarEmoji: '🍝', colorHex: '#E0A500' },
  { personId: 'p4', name: 'Kramer', avatarEmoji: '🌀', colorHex: '#25A368' },
  { personId: 'p5', name: 'Newman', avatarEmoji: '📬', colorHex: '#8B5CF6' },
]

export const EventParticipants = () => <AvatarStack members={family.slice(0, 3)} />

export const CappedLarge = () => <AvatarStack members={family} max={4} size="md" />
