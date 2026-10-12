import { Placeholder } from '@waffled/web'

export const ComingSoon = () => (
  <div style={{ width: 560, height: 360, display: 'flex' }}>
    <Placeholder title="Photos" icon="photos" />
  </div>
)

export const EmptyState = () => (
  <div style={{ width: 560, height: 360, display: 'flex' }}>
    <Placeholder title="No goals yet" icon="goals">
      <div className="muted" style={{ marginBottom: 14 }}>Pick something the family wants to get better at together.</div>
      <button className="btn btn-primary">Start a goal</button>
    </Placeholder>
  </div>
)
