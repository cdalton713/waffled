import { PriorityFlag } from '@waffled/web'

export const InListRows = () => (
  <div style={{ display: 'grid', gap: 8, width: 320 }}>
    {[
      { t: 'Renew car registration', p: 5 },
      { t: 'Book dentist for kids', p: 4 },
      { t: 'Return library books', p: 3 },
    ].map((r) => (
      <div key={r.t} className="set-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <PriorityFlag priority={r.p} />
        <span style={{ fontWeight: 600 }}>{r.t}</span>
      </div>
    ))}
  </div>
)

export const Levels = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <span><PriorityFlag priority={4} /> High</span>
    <span><PriorityFlag priority={5} /> Urgent</span>
  </div>
)
