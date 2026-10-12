import { Check } from '@waffled/web'

export const DoneBadge = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary-t)', color: 'var(--primary-d)', padding: '6px 12px', borderRadius: 999, fontWeight: 700, fontSize: 14 }}>
    <Check size={14} /> Done
  </span>
)

export const OnAccent = () => (
  <span style={{ display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 999, background: 'var(--primary)', color: 'var(--on-accent)' }}>
    <Check size={18} />
  </span>
)
