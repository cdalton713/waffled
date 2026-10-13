// "Kiosk mode" (Settings → Display & Kiosk): a per-device, consume-only view for a
// wall tablet. Creation controls (add / new / edit / Customize / the capture bar)
// are hidden so content gets the room; check-offs, timers, approvals and cook mode
// keep working. Named viewOnly in code because isKioskMode() (lib/api) already
// means "this device is paired as a kiosk", which is a different thing.
import { useSyncExternalStore, type ReactNode } from 'react'

export const VIEW_ONLY_KEY = 'waffled.kiosk.viewOnly'
const EVENT = 'waffled:view-only-changed'

export function isViewOnly(): boolean {
  try {
    return localStorage.getItem(VIEW_ONLY_KEY) === '1'
  } catch {
    return false
  }
}

function apply(on: boolean): void {
  if (typeof document === 'undefined') return
  if (on) document.documentElement.setAttribute('data-view-only', 'on')
  else document.documentElement.removeAttribute('data-view-only')
}

export function setViewOnly(on: boolean): void {
  try {
    if (on) localStorage.setItem(VIEW_ONLY_KEY, '1')
    else localStorage.removeItem(VIEW_ONLY_KEY)
  } catch {
    // Non-fatal: the choice just won't survive a reload.
  }
  apply(on)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
}

export function initViewOnly(): void {
  apply(isViewOnly())
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  // Another tab on the same device flipping it.
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useViewOnly(): boolean {
  return useSyncExternalStore(subscribe, isViewOnly, () => false)
}

/** Wrap a creation control; it disappears (and frees its space) in kiosk mode. */
export function Editable({ children }: { children: ReactNode }) {
  return useViewOnly() ? null : <>{children}</>
}
