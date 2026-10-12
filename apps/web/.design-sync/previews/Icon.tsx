import { Icon } from '@waffled/web'

const NAV = ['home', 'calendar', 'tasks', 'meals', 'recipes', 'lists', 'photos', 'goals', 'planning', 'settings'] as const
const UTIL = ['plus', 'close', 'menu', 'filter', 'clock', 'bag', 'pantry', 'family', 'cloud', 'spark', 'mic', 'cl', 'cr'] as const

// Icon draws a bare 24x24 <svg>; the app sizes/strokes it via its context class.
// `.btn` and `.pill` are the two contexts a design will use most.
export const InButtons = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    <button className="btn btn-primary"><Icon name="plus" /> Add event</button>
    <button className="btn btn-ghost"><Icon name="filter" /> Filter</button>
    <button className="pill"><Icon name="clock" /> 20 min</button>
  </div>
)

export const NavigationSet = () => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--rail)', padding: 10, borderRadius: 16 }}>
    {NAV.map((n) => (
      <div key={n} className="rail-item" title={n}><Icon name={n} /></div>
    ))}
  </div>
)

export const UtilitySet = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {UTIL.map((n) => (
      <span key={n} className="icon-btn" title={n}><Icon name={n} /></span>
    ))}
  </div>
)
