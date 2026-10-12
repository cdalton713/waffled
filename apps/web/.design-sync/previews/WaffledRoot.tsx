import { WaffledRoot } from '@waffled/web'

const Sample = () => (
  <div style={{ background: 'var(--bg)', padding: 20, borderRadius: 18, width: 380 }}>
    <div className="wf-serif" style={{ fontSize: 24, fontWeight: 600, marginBottom: 6 }}>Tuesday dinner</div>
    <div className="muted" style={{ marginBottom: 14 }}>Taco night · ready by 6:30</div>
    <div style={{ display: 'flex', gap: 10 }}>
      <button className="btn btn-primary">Start cooking</button>
      <button className="btn btn-ghost">Swap meal</button>
    </div>
  </div>
)

export const DefaultPalette = () => (
  <WaffledRoot>
    <Sample />
  </WaffledRoot>
)

export const KitchenPalette = () => (
  <WaffledRoot palette="kitchen">
    <Sample />
  </WaffledRoot>
)
