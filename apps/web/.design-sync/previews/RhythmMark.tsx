import { RhythmMark } from '@waffled/web'

const ev = (title: string, rhythmId: string | null) => ({
  id: title, title, startsAt: '2026-10-14T18:00:00Z', endsAt: null, allDay: false, location: null,
  personId: null, rhythmId, personName: null, personColor: null, personEmoji: null, participants: [],
})

export const InEventChips = () => (
  <div style={{ display: 'grid', gap: 6, width: 260 }}>
    {[ev('Family pizza night', 'r1'), ev('Soccer practice', null), ev('Call Grandma', 'r2')].map((e) => (
      <div key={e.id} className="set-card" style={{ padding: '8px 12px', fontWeight: 600 }}>
        <RhythmMark event={e} />{e.title}
      </div>
    ))}
  </div>
)
