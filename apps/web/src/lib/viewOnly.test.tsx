import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Editable, VIEW_ONLY_KEY, initViewOnly, isViewOnly, setViewOnly, useViewOnly } from './viewOnly'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-view-only')
})

function Probe() {
  return <span>{useViewOnly() ? 'locked' : 'open'}</span>
}

describe('kiosk mode (view-only) flag', () => {
  it('is off by default and for a garbage stored value', () => {
    expect(isViewOnly()).toBe(false)
    localStorage.setItem(VIEW_ONLY_KEY, 'maybe')
    expect(isViewOnly()).toBe(false)
  })

  it('setViewOnly persists on this device and stamps <html data-view-only>', () => {
    setViewOnly(true)
    expect(localStorage.getItem(VIEW_ONLY_KEY)).toBe('1')
    expect(isViewOnly()).toBe(true)
    expect(document.documentElement.getAttribute('data-view-only')).toBe('on')
    setViewOnly(false)
    expect(isViewOnly()).toBe(false)
    expect(document.documentElement.hasAttribute('data-view-only')).toBe(false)
  })

  it('initViewOnly applies the stored flag on boot', () => {
    localStorage.setItem(VIEW_ONLY_KEY, '1')
    initViewOnly()
    expect(document.documentElement.getAttribute('data-view-only')).toBe('on')
  })

  it('useViewOnly re-renders live when the flag flips', () => {
    render(<Probe />)
    expect(screen.getByText('open')).toBeInTheDocument()
    act(() => setViewOnly(true))
    expect(screen.getByText('locked')).toBeInTheDocument()
  })

  it('<Editable> hides creation controls in kiosk mode and shows them otherwise', () => {
    render(<Editable><button>+ New chore</button></Editable>)
    expect(screen.getByRole('button', { name: '+ New chore' })).toBeInTheDocument()
    act(() => setViewOnly(true))
    expect(screen.queryByRole('button', { name: '+ New chore' })).toBeNull()
  })
})
