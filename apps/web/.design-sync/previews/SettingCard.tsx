import { SettingCard } from '@waffled/web'

export const ToggleRow = () => (
  <div style={{ width: 460 }}>
    <SettingCard>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <span>
          <div style={{ fontWeight: 700 }}>Kiosk mode</div>
          <div className="tiny muted">Hide create and edit controls on this device.</div>
        </span>
        <span className="toggle on" />
      </label>
    </SettingCard>
  </div>
)

export const FormFields = () => (
  <div style={{ width: 460 }}>
    <SettingCard>
      <div className="wf-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Household</div>
      <label className="field" style={{ marginBottom: 12 }}>
        <span>Family name</span>
        <input defaultValue="The Seinfelds" />
      </label>
      <label className="field">
        <span>Week starts on</span>
        <select defaultValue="sun"><option value="sun">Sunday</option><option value="mon">Monday</option></select>
      </label>
    </SettingCard>
  </div>
)
