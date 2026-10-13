import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ListItemModal } from './ListItemModal'
import type { ListItem } from '../../lib/api'

interface Sent { method: string; url: string; body: any }

function mock(sent: Sent[]) {
  globalThis.fetch = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    sent.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body ? JSON.parse(init.body) : undefined })
    return { ok: true, json: async () => ({ item: { id: 'i1', name: 'Milk' } }) }
  }) as unknown as typeof fetch
}

const item: ListItem = {
  id: 'i1', name: 'Milk', quantity: null, note: 'the blue cap one', checked: false, checkedAt: null,
  section: null, priority: 3, sortOrder: 0, assignee: null,
}

describe('ListItemModal — note', () => {
  it('shows the item note and PATCHes an edited one', async () => {
    const sent: Sent[] = []
    mock(sent)
    render(<ListItemModal listId="L" item={item} persons={[]} sections={[]} onClose={() => {}} onSaved={() => {}} />)
    const note = screen.getByLabelText('Note') as HTMLInputElement
    expect(note.value).toBe('the blue cap one')
    fireEvent.change(note, { target: { value: 'organic' } })
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))
    await waitFor(() => expect(sent.some((s) => s.method === 'PATCH')).toBe(true))
    expect(sent.find((s) => s.method === 'PATCH')!.body).toMatchObject({ note: 'organic' })
  })

  it('sends a note when adding', async () => {
    const sent: Sent[] = []
    mock(sent)
    render(<ListItemModal listId="L" item={null} persons={[]} sections={[]} onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Beach towels'), { target: { value: 'Eggs' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'large' } })
    fireEvent.click(screen.getByRole('button', { name: /Add item/i }))
    await waitFor(() => expect(sent.some((s) => s.method === 'POST')).toBe(true))
    expect(sent.find((s) => s.method === 'POST')!.body).toMatchObject({ name: 'Eggs', note: 'large' })
  })
})
