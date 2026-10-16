import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

it('names the dialog and lets Escape cancel without confirming', () => {
  const onClose = vi.fn()
  const onConfirm = vi.fn()
  render(<ConfirmDialog title="Remove recipe" message="Remove this recipe from the library?" onClose={onClose} onConfirm={onConfirm} />)
  const dialog = screen.getByRole('dialog', { name: 'Remove recipe' })
  expect(dialog).toHaveAccessibleDescription('Remove this recipe from the library?')
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
  expect(onConfirm).not.toHaveBeenCalled()
})

it('submits a trimmed prompt once while a save is pending', async () => {
  let finish!: () => void
  const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  render(<ConfirmDialog title="Rename list" input={{ label: 'Name', initial: ' Packing ' }} onClose={vi.fn()} onConfirm={onConfirm} />)
  const dialog = screen.getByRole('dialog', { name: 'Rename list' })
  const form = dialog.querySelector('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(onConfirm).toHaveBeenCalledOnce()
  expect(onConfirm).toHaveBeenCalledWith('Packing')
  expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  finish()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled())
})
