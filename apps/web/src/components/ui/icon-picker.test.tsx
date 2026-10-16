import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { IconPicker } from './icon-picker'
import { DataIcon } from './data-icon'

it('renders a saved avatar as an accessible Lucide symbol', () => {
  render(<DataIcon value="🐢" kind="person" label="Wally" />)
  expect(screen.getByRole('img', { name: 'Wally' }).tagName.toLowerCase()).toBe('svg')
  expect(screen.queryByText('🐢')).not.toBeInTheDocument()
})

it('uses a context fallback for an unknown saved value without changing it', () => {
  const onValueChange = vi.fn()
  render(
    <IconPicker
      value="unknown-legacy-symbol"
      onValueChange={onValueChange}
      aria-label="Recipe icon"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Recipe icon' }))
  expect(screen.getByRole('dialog', { name: 'Choose an icon' })).toBeInTheDocument()
  expect(onValueChange).not.toHaveBeenCalled()
})

it('shows Lucide choices and sends the compatible value only after selection', () => {
  const onValueChange = vi.fn()
  render(<IconPicker value={null} onValueChange={onValueChange} aria-label="Recipe icon" />)
  fireEvent.click(screen.getByRole('button', { name: 'Recipe icon' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cooking' }))
  expect(onValueChange).toHaveBeenCalledOnce()
  expect(onValueChange).toHaveBeenCalledWith('🍽️')
  expect(screen.queryByRole('dialog', { name: 'Choose an icon' })).not.toBeInTheDocument()
})

it('lets currencies keep a text symbol while icon choices remain available', () => {
  const onValueChange = vi.fn()
  render(
    <IconPicker allowText value="$" onValueChange={onValueChange} aria-label="Currency symbol" />,
  )
  expect(screen.getByRole('button', { name: 'Currency symbol' })).toHaveTextContent('$')
  fireEvent.click(screen.getByRole('button', { name: 'Currency symbol' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Text symbol' }), {
    target: { value: 'XP' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Use text' }))
  expect(onValueChange).toHaveBeenCalledWith('XP')
})
