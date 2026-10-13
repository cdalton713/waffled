import { useNavigate } from 'react-router'
import { useTopbarRight } from './topbar-slot'
import { useFamilyOverview, type FamilyMember } from '../lib/api'
import './../styles/overview.css'
import { Button } from '@/components/ui/button'
import { DataIcon } from '@/components/ui/data-icon'

function MemberCard({ m, onOpen }: { m: FamilyMember; onOpen: () => void }) {
  return (
    <Button variant="unstyled" type="button" className="card fam-card" onClick={onOpen}>
      <div className="fam-head">
        <span
          className="fam-av"
          style={{ background: m.colorHex ? `${m.colorHex}22` : 'var(--panel)' }}
        >
          <DataIcon value={m.avatarEmoji ?? '🙂'} kind="person" />
        </span>
        <div className="fam-name-wrap">
          <div className="fam-name">{m.name}</div>
          {m.age != null && (
            <div className="tiny muted" style={{ fontWeight: 600 }}>
              Age {m.age}
            </div>
          )}
        </div>
        {m.topStreak >= 2 && (
          <span className="fam-streak">
            <>
              <DataIcon value={'🔥'} kind="person" />{' '}
            </>
            {m.topStreak}
          </span>
        )}
      </div>
      <div className="fam-stats">
        <div className="fam-stat">
          <div className="fam-stat-n">{m.activeGoals}</div>
          <div className="fam-stat-l">goals</div>
        </div>
        <div className="fam-stat">
          <div className="fam-stat-n">{m.avgProgressPct}%</div>
          <div className="fam-stat-l">avg progress</div>
        </div>
        <div className="fam-stat">
          <div className="fam-stat-n" style={{ color: 'var(--gold-d)' }}>
            <>
              <DataIcon value={'⭐'} kind="person" />{' '}
            </>
            {m.stars}
          </div>
          <div className="fam-stat-l">stars</div>
        </div>
      </div>
      <div className="fam-bar">
        <span style={{ width: `${m.avgProgressPct}%` }} />
      </div>
    </Button>
  )
}

export function FamilyOverview() {
  const navigate = useNavigate()
  const { people, loading, error } = useFamilyOverview()

  useTopbarRight(
    () => (
      <Button
        variant="unstyled"
        className="pill"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/goals')}
      >
        <>
          <DataIcon value={'🎯'} kind="person" />
          {' Goals'}
        </>
      </Button>
    ),
    [navigate],
  )

  if (loading)
    return (
      <div className="muted" style={{ padding: 30 }}>
        Loading…
      </div>
    )
  if (error)
    return (
      <div className="muted" style={{ padding: 30 }}>
        Couldn’t load the family overview.
      </div>
    )

  return (
    <div className="family-overview">
      <div className="fam-title wf-serif">How everyone’s doing</div>
      <div className="fam-grid">
        {people.map((m) => (
          <MemberCard key={m.personId} m={m} onOpen={() => navigate(`/person/${m.personId}`)} />
        ))}
      </div>
    </div>
  )
}
