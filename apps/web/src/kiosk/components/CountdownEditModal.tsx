import { useState, type FormEvent } from 'react'
import { countdownsApi, type Countdown } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'

// Edit a STANDALONE countdown (the "add anything" kind) straight from the calendar —
// rename it, move its date, or remove it. Event-sourced countdowns are edited through
// the event itself, and birthdays come from a person's profile, so this only handles
// the standalone source (the one with no other editing surface).
export function CountdownEditModal({
  countdown,
  onClose,
  onChanged,
}: {
  countdown: Countdown
  onClose: () => void
  onChanged?: () => void
}) {
  const [title, setTitle] = useState(countdown.title)
  const [date, setDate] = useState(countdown.date)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await countdownsApi.update(countdown.id, { title: title.trim(), date })
      onChanged?.()
      onClose()
    } catch {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    try {
      await countdownsApi.remove(countdown.id)
      onChanged?.()
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <Button
          variant="unstyled"
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <DataIcon value={'×'} kind="general" />
        </Button>
        <div className="wf-serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>
          Edit countdown
        </div>
        <form onSubmit={save}>
          <Label className="field">
            <span>Name</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Disney trip"
              autoFocus
            />
          </Label>
          <Label className="field">
            <span>Counting down to</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Label>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <Button
              variant="ghost"
              type="button"
              onClick={remove}
              disabled={busy}
              style={{ color: 'var(--danger)' }}
            >
              Remove
            </Button>
            <Button
              variant="default"
              type="submit"
              disabled={!title.trim() || busy}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
