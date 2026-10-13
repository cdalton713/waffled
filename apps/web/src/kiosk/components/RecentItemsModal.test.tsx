import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecentItemsModal } from './RecentItemsModal'

const recent = [
  { id: 'r1', name: 'Apples', quantity: '6', note: null, checked: true, checkedAt: '2026-10-10T00:00:00Z', section: 'Fruit', sortOrder: 0, assignee: null },
  { id: 'r2', name: 'Bread', quantity: null, note: null, checked: true, checkedAt: '2026-10-09T00:00:00Z', section: null, sortOrder: 1, assignee: null },
]

describe('RecentItemsModal', () => {
  it('lists recently crossed-off items and re-adds one', async () => {
    const sent: Array<{ method: string; url: string }> = []
    globalThis.fetch = vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url)
      sent.push({ method: init?.method ?? 'GET', url: u })
      if (u.endsWith('/api/lists/L/recent')) return { ok: true, json: async () => ({ items: recent }) }
      if (u.endsWith('/api/list-items/r1/readd')) return { ok: true, json: async () => ({ item: { ...recent[0], checked: false } }) }
      return { ok: false, status: 404, json: async () => ({}) }
    }) as unknown as typeof fetch
    const onAdded = vi.fn()
    render(<RecentItemsModal listId="L" onClose={() => {}} onAdded={onAdded} />)
    expect(await screen.findByText('Apples')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Apples back' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(sent.some((s) => s.method === 'POST' && s.url.endsWith('/readd'))).toBe(true)
    expect(screen.queryByText('Apples')).not.toBeInTheDocument()
    expect(screen.getByText('Bread')).toBeInTheDocument()
  })

  it('says so when nothing has been crossed off', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })) as unknown as typeof fetch
    render(<RecentItemsModal listId="L" onClose={() => {}} onAdded={() => {}} />)
    expect(await screen.findByText(/Nothing crossed off yet/)).toBeInTheDocument()
  })
})
