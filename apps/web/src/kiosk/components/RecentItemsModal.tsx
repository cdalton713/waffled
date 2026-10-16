import { useEffect, useState } from 'react'
import { groceryApi, type ListItem } from '../../lib/api'
import '../../styles/grocery.css'
import { Button } from '@/components/ui/button'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'

// "Recently crossed off" for one list — the buy-it-again shelf. Each row puts the item
// back (with its quantity, note and section) in one tap.
export function RecentItemsModal({
  listId,
  onClose,
  onAdded,
}: {
  listId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [items, setItems] = useState<ListItem[] | null>(null)

  useEffect(() => {
    let live = true
    groceryApi
      .recentItems(listId)
      .then((r) => {
        if (live) setItems(r)
      })
      .catch(() => {
        if (live) setItems([])
      })
    return () => {
      live = false
    }
  }, [listId])

  async function readd(item: ListItem) {
    await groceryApi.readdItem(item.id)
    setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null)
    onAdded()
  }

  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <Button
          variant="unstyled"
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <DataIcon value={'×'} kind="general" />
        </Button>
        <div className="wf-serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          Recently crossed off
        </div>
        <div className="tiny muted" style={{ fontWeight: 600, marginBottom: 14 }}>
          Tap Add to put something back on the list.
        </div>
        {items === null ? (
          <div className="tiny muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="tiny muted" style={{ fontWeight: 600 }}>
            Nothing crossed off yet.
          </div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.map((i) => (
              <div key={i.id} className="gitem">
                <span className="gitem-body">
                  <span className="gnm">{i.name}</span>
                  {i.note && (
                    <span className="gattr">
                      <>
                        <DataIcon value={'📝'} kind="general" />{' '}
                      </>
                      {i.note}
                    </span>
                  )}
                </span>
                {i.quantity && <span className="gqty">{i.quantity}</span>}
                <span className="gitem-acts">
                  <Button
                    variant="unstyled"
                    type="button"
                    className="pill"
                    style={{ cursor: 'pointer' }}
                    aria-label={`Add ${i.name} back`}
                    onClick={() => readd(i)}
                  >
                    <>
                      <DataIcon value={'＋'} kind="general" />
                      {' Add'}
                    </>
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
