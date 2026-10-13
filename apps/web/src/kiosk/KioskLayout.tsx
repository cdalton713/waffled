import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { Rail } from './components/Rail'
import { ScreenBoundary } from './components/ScreenBoundary'
import { Topbar } from './components/Topbar'
import { OfflineBanner } from './components/OfflineBanner'
import { SyncHealthBanner } from './components/SyncHealthBanner'
import { UpdateModal } from './components/UpdateModal'
import { TopbarSlotProvider } from './topbar-slot'
import { Icon } from './icons'
import { activeScreen } from './nav'
import '../styles/kiosk-profiles.css'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'

// The persistent kiosk chrome (responsive, fills the viewport). The active
// screen renders in the Outlet and can fill the topbar's right slot. (Idle /
// screensaver / keep-awake live in KioskDisplay, which wraps the whole app.)
export function KioskLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 720,
  )
  const triggerRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const active = activeScreen(location.pathname)

  useEffect(() => setNavOpen(false), [location.pathname])
  useEffect(() => {
    const resize = () => {
      const small = window.innerWidth <= 720
      setPhone(small)
      if (!small) setNavOpen(false)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (!navOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <Sheet open={phone && navOpen} onOpenChange={setNavOpen}>
      <TopbarSlotProvider>
        <div className="wf-kiosk wf">
          <header className="mobile-header">
            <Link to="/" className="mobile-brand" aria-label="Waffled home">
              <img src="/logo.png" alt="" />
              <span>{active?.label ?? 'Waffled'}</span>
            </Link>
            <Button
              variant="unstyled"
              ref={triggerRef}
              type="button"
              className="mobile-menu-button"
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
              aria-controls="primary-navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              <Icon name={navOpen ? 'close' : 'menu'} />
            </Button>
          </header>
          {!phone && <Rail onNavigate={() => setNavOpen(false)} />}
          {phone && (
            <SheetContent
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                triggerRef.current?.focus()
              }}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <header className="mobile-header" style={{ pointerEvents: 'auto' }}>
                <Link
                  to="/"
                  className="mobile-brand"
                  aria-label="Waffled home"
                  onClick={() => setNavOpen(false)}
                >
                  <img src="/logo.png" alt="" />
                  <span>{active?.label ?? 'Waffled'}</span>
                </Link>
                <SheetClose asChild>
                  <Button
                    variant="unstyled"
                    type="button"
                    className="mobile-menu-button"
                    aria-label="Close navigation"
                  >
                    <Icon name="close" />
                  </Button>
                </SheetClose>
              </header>
              <Rail mobileOpen onNavigate={() => setNavOpen(false)} />
            </SheetContent>
          )}
          <div className="kiosk-main">
            <OfflineBanner />
            <SyncHealthBanner />
            <Topbar />
            {/* Screens are code-split (see ./routes), so navigating can suspend while the
              chunk loads. Keep the boundary here, inside the chrome — a boundary around
              <KioskRoutes> would blank the rail and topbar on every navigation. The
              fallback is empty on purpose: over LAN the chunk arrives within a frame or
              two, and a spinner that flashes that briefly reads as a glitch. */}
            <ScreenBoundary key={location.pathname}>
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </ScreenBoundary>
          </div>
          <UpdateModal />
        </div>
      </TopbarSlotProvider>
    </Sheet>
  )
}
