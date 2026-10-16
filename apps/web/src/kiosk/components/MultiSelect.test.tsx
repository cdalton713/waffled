import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { MultiSelect } from './MultiSelect'

it('keeps multi-selection controlled and restores focus after Escape', async () => {
  const change = vi.fn()
  render(
    <MultiSelect
      label="Dietary"
      options={['Vegetarian', 'Gluten free']}
      selected={['Vegetarian']}
      onChange={change}
    />,
  )
  const trigger = screen.getByRole('button', { name: 'Dietary · 1' })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Gluten free' }))
  expect(change).toHaveBeenCalledWith(['Vegetarian', 'Gluten free'])
  const dialog = screen.getByRole('dialog', { name: 'Dietary' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(trigger).toHaveFocus())
})
