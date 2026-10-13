import type React from 'react'
import { ConfirmDialog } from '@waffled/web'

const noop = () => {}

// .modal-overlay is position:fixed; the transform makes this box its containing block so
// the scrim + centered card render inside the preview cell instead of the page.
const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: 520, height: 360, transform: 'translateZ(0)' }}>{children}</div>
)

export const Destructive = () => (
  <Stage>
  <ConfirmDialog
    title="Delete “Taco Tuesday”?"
    message="It comes off this week’s meal plan. The recipe stays in your library."
    confirmLabel="Delete"
    danger
    onConfirm={noop}
    onClose={noop}
  />
  </Stage>
)

export const Rename = () => (
  <Stage>
  <ConfirmDialog
    title="Rename album"
    input={{ label: 'Album name', placeholder: 'Summer at the lake', initial: 'Beach week 2026' }}
    confirmLabel="Save"
    onConfirm={noop}
    onClose={noop}
  />
  </Stage>
)
