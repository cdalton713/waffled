import { useEffect, useState } from 'react'
import { groceryApi, type ListItem } from '../../lib/api'
import '../../styles/grocery.css'

// "Recently crossed off" for one list — the buy-it-again shelf. Each row puts the item
// back (with its quantity, note and section) in one tap.
export function RecentItemsModal({ listId, onClose, onAdded }: { listId: string; onClose: () => void; onAdded: () => void }) {
  const [items, setItems] = useState<ListItem[] | null>(null)

  useEffect(() => {
    let live = true
    groceryApi.recentItems(listId).then((r) => { if (live) setItems(r) }).catch(() => { if (live) setItems([]) })
    return () => { live = false }
  }, [listId])

  async function readd(item: ListItem) {
    await groceryApi.readdItem(item.id)
    setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null)
    onAdded()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <div className="wf-serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Recently crossed off</div>
        <div className="tiny muted" style={{ fontWeight: 600, marginBottom: 14 }}>Tap + to put something back on the list.</div>
        {items === null ? (
          <div className="tiny muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="tiny muted" style={{ fontWeight: 600 }}>Nothing crossed off yet.</div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.map((i) => (
              <div key={i.id} className="gitem">
                <span className="gitem-body">
                  <span className="gnm">{i.name}</span>
                  {i.note && <span className="gattr">📝 {i.note}</span>}
                </span>
                {i.quantity && <span className="gqty">{i.quantity}</span>}
                <span className="gitem-acts">
                  <button type="button" className="gact" aria-label={`Add ${i.name} back`} title="Add back" onClick={() => readd(i)}>+</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
