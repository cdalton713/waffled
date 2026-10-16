import { fireEvent, screen } from '@testing-library/react'

export async function selectOption(trigger: HTMLElement, label: string) {
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole('option', { name: label }))
}
