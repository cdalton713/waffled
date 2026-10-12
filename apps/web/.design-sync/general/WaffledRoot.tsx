// Root wrapper for designs built with the Waffled DS. `.wf` sets the font + ink; without
// it components render in browser-default type. Palette/theme live on <html> (as in
// lib/theme.ts) because the CSS keys off :root[data-palette]/[data-theme]; they are only
// stamped when passed, so a nested WaffledRoot never resets an outer one's choice.
import { useLayoutEffect, type ReactNode } from 'react'

export function WaffledRoot({
  palette,
  theme,
  kiosk = false,
  children,
}: {
  palette?: 'default' | 'kitchen'
  theme?: 'light' | 'dark'
  kiosk?: boolean
  children?: ReactNode
}) {
  useLayoutEffect(() => {
    const root = document.documentElement
    if (palette === 'kitchen') root.setAttribute('data-palette', 'kitchen')
    else if (palette === 'default') root.removeAttribute('data-palette')
    if (theme) root.setAttribute('data-theme', theme)
  }, [palette, theme])
  return <div className={kiosk ? 'wf wf-kiosk' : 'wf'}>{children}</div>
}
