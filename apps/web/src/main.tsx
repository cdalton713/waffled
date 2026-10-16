import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/ui.css'
import './styles/waffled.css'
import './styles/kiosk.css'
import './styles/calendar.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource-variable/bricolage-grotesque'
import './styles/kitchen.css'
import './styles/night-pantry.css'
import '@fontsource-variable/lexend'
import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/nunito'
import '@fontsource/andika/400.css'
import '@fontsource/andika/700.css'
import './styles/typefaces.css'
import { KioskRoutes } from './kiosk/routes'
import { AuthGate } from './kiosk/AuthGate'
import { KioskDisplay } from './kiosk/KioskDisplay'
import { ServerUnreachableBanner } from './kiosk/components/ServerUnreachableBanner'
import { registerServiceWorker } from './lib/pwa'
import { connectPowerSync } from './lib/powersync/db'
import { initTheme } from './lib/theme'
import { initViewOnly } from './lib/viewOnly'
import { applyEventStyle } from './lib/display'

// Apply the saved (or OS-matched) theme before first paint to avoid a flash.
initTheme()
initViewOnly()
// Same for event chips: stamp the default style before the household loads, so
// the calendar never flashes tinted chips on its way to solid. The Topbar
// corrects this once /api/household resolves (and on every household change).
applyEventStyle('solid')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <KioskDisplay>
        {/* Above AuthGate so the login / setup / picker screens get it too. */}
        <ServerUnreachableBanner />
        <AuthGate>
          <KioskRoutes />
        </AuthGate>
      </KioskDisplay>
    </BrowserRouter>
  </StrictMode>
)

registerServiceWorker()

// Start realtime replication (best-effort; the app works over REST without it).
void connectPowerSync()
