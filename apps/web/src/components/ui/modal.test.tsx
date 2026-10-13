import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from './modal'
import { Button } from './button'

it('names the dialog, cancels with Escape, and restores focus to its opener', async () => {
  function Example() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open details</Button>
        {open && (
          <Modal onClose={() => setOpen(false)}>
            <div className="modal-card">
              <h2>Details</h2>
              <input aria-label="Name" />
            </div>
          </Modal>
        )}
      </>
    )
  }
  render(<Example />)
  const opener = screen.getByRole('button', { name: 'Open details' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = screen.getByRole('dialog', { name: 'Details' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(opener).toHaveFocus())
})

it('preserves an explicitly named surface even when a heading has different text', () => {
  render(
    <Modal>
      <div aria-label="New goal for this week">
        <h2>Editor</h2>
        <input aria-label="Goal title" />
      </div>
    </Modal>,
  )
  expect(screen.getByRole('dialog', { name: 'New goal for this week' })).toBeInTheDocument()
})
