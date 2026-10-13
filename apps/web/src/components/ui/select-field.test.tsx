import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { SelectField } from './select-field'
import { DataIcon } from './data-icon'
import { Label } from './label'

it('associates its label with the visible control', () => {
  const { container } = render(
    <Label>
      <span>Assignee</span>
      <SelectField value="" onValueChange={vi.fn()}>
        <option value="">Everyone</option>
      </SelectField>
    </Label>,
  )
  expect(container.querySelector('label')?.control).toBe(
    screen.getByRole('combobox', { name: 'Assignee' }),
  )
})

it('selects a person by keyboard and submits the original value', async () => {
  const save = vi.fn()
  function Form() {
    const [person, setPerson] = useState('')
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save(new FormData(event.currentTarget).get('person'))
        }}
      >
        <Label>
          <span>Assign to</span>
          <SelectField name="person" value={person} onValueChange={setPerson}>
            <option value="">Everyone</option>
            <option value="person-1">
              <DataIcon value="🐢" /> Wally
            </option>
          </SelectField>
        </Label>
        <button type="submit">Save</button>
      </form>
    )
  }
  render(<Form />)
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Assign to' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'Wally' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenCalledWith('person-1')
  expect(screen.getByRole('combobox', { name: 'Assign to' })).toHaveTextContent('Wally')
})

it('supports an empty selection without writing an internal option identifier', async () => {
  const change = vi.fn()
  render(
    <SelectField aria-label="Assignee" value="person-1" onValueChange={change}>
      <option value="">Everyone</option>
      <option value="person-1">Wally</option>
    </SelectField>,
  )
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Assignee' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'Everyone' }))
  expect(change).toHaveBeenCalledWith('')
})
