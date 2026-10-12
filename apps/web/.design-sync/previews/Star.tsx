import { Star } from '@waffled/web'

export const RewardCount = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gold)', fontWeight: 800, fontSize: 18 }}>
    <Star size={18} /> 12 stars
  </span>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'var(--gold)' }}>
    <Star size={12} />
    <Star size={18} />
    <Star size={28} />
  </div>
)
