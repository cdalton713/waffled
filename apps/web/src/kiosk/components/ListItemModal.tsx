import { useState, type FormEvent } from 'react'
import { listWrites, type ListItem, type Person } from '../../lib/api'
import { PRIORITY_OPTIONS } from './priority'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'

// Add or edit a list item — name, quantity (free text like "1 lb" / "×4"),
// note, section, and assignee. Touch-friendly (a real form, not a hover affordance).
export function ListItemModal({
  listId,
  item,
  persons,
  sections,
  onClose,
  onSaved,
}: {
  listId: string
  item: ListItem | null
  persons: Person[]
  sections: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [section, setSection] = useState(item?.section ?? '')
  const [assignedTo, setAssignedTo] = useState<string>(item?.assignee?.personId ?? '')
  const [priority, setPriority] = useState<number>(item?.priority ?? 3)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      quantity: quantity.trim() || null,
      note: note.trim() || null,
      section: section.trim() || null,
      assignedTo: assignedTo || null,
      priority,
    }
    try {
      if (editing) await listWrites.patchItem(item!, payload)
      else await listWrites.addItem(listId, payload)
      onSaved()
      onClose()
    } catch {
      setSaving(false)
    }
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
          <DataIcon value={'×'} kind="list" />
        </Button>
        <div className="wf-serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>
          {editing ? 'Edit item' : 'Add item'}
        </div>

        <form onSubmit={submit}>
          <div className="field-row">
            <Label className="field" style={{ flex: 3 }}>
              <span>Item</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Beach towels"
                autoFocus
              />
            </Label>
            <Label className="field" style={{ flex: 1 }}>
              <span>Quantity</span>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="×4 / 1 lb"
              />
            </Label>
          </div>

          <Label className="field">
            <span>Note</span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. the blue cap one"
            />
          </Label>

          <Label className="field">
            <span>Section</span>
            <Input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. Produce, Gear"
              list="list-sections"
            />
            <datalist id="list-sections">
              {sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Label>

          <div className="field">
            <span>Priority</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRIORITY_OPTIONS.map((o) => {
                const on = priority === o.value
                return (
                  <Button
                    variant="unstyled"
                    type="button"
                    key={o.value}
                    aria-pressed={on}
                    onClick={() => setPriority(o.value)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: on ? '1.5px solid var(--ink)' : '1px solid var(--hair)',
                      background: on ? 'var(--panel)' : 'var(--card-2)',
                      font: 'inherit',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {o.icon && (
                      <span aria-hidden>
                        <DataIcon value={o.icon} kind="list" />
                      </span>
                    )}{' '}
                    {o.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="field">
            <span>Assign to (optional)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button
                variant="unstyled"
                type="button"
                onClick={() => setAssignedTo('')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: assignedTo === '' ? '1.5px solid var(--ink)' : '1px solid var(--hair)',
                  background: assignedTo === '' ? 'var(--panel)' : 'var(--card-2)',
                  font: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <>
                  <DataIcon value={'👪'} kind="list" />
                  {' Anyone'}
                </>
              </Button>
              {persons.map((p) => {
                const on = assignedTo === p.id
                const color = p.colorHex ?? '#6B6B70'
                return (
                  <Button
                    variant="unstyled"
                    type="button"
                    key={p.id}
                    onClick={() => setAssignedTo(p.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: on ? `1.5px solid ${color}` : '1px solid var(--hair)',
                      background: on ? `${color}22` : 'var(--card-2)',
                      font: 'inherit',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <DataIcon value={p.avatarEmoji ?? '🙂'} kind="person" /> {p.name}
                  </Button>
                )
              })}
            </div>
          </div>

          <Button
            variant="default"
            type="submit"
            disabled={!name.trim() || saving}
            style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
