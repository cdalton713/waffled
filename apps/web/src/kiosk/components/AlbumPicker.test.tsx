import { selectOption } from '../../test/select-option'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlbumPicker } from './AlbumPicker'

// A controlled harness so we can read back what AlbumPicker reports via onChange.
function Harness({
  initial = '',
  albums = ['Lake Day', 'Birthday'],
}: {
  initial?: string
  albums?: string[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <div data-testid="value">{value}</div>
      <AlbumPicker value={value} onChange={setValue} albums={albums} />
    </>
  )
}

describe('AlbumPicker', () => {
  it('lists existing albums + (No album) + ＋ New album…', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual([
      '(No album)',
      'Lake Day',
      'Birthday',
      'New album…',
    ])
  })

  it('selecting an existing album reports it', async () => {
    render(<Harness />)
    await selectOption(screen.getByRole('combobox'), 'Lake Day')
    expect(screen.getByTestId('value')).toHaveTextContent('Lake Day')
    // no text input while an existing album is selected
    expect(screen.queryByPlaceholderText('New album name')).not.toBeInTheDocument()
  })

  it('(No album) reports an empty value', async () => {
    render(<Harness initial="Lake Day" />)
    await selectOption(screen.getByRole('combobox'), '(No album)')
    expect(screen.getByTestId('value')).toHaveTextContent('')
  })

  it('New album… reveals a text input that reports typed names', async () => {
    render(<Harness />)
    await selectOption(screen.getByRole('combobox'), 'New album…')
    const input = screen.getByPlaceholderText('New album name')
    fireEvent.change(input, { target: { value: 'Beach Trip' } })
    expect(screen.getByTestId('value')).toHaveTextContent('Beach Trip')
  })

  it('shows the text input when value is an unknown album', () => {
    render(<Harness initial="Ski Trip" />)
    expect((screen.getByPlaceholderText('New album name') as HTMLInputElement).value).toBe(
      'Ski Trip',
    )
  })
})
