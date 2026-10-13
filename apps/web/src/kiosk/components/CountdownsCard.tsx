import { useState } from 'react'
import { Editable } from '../../lib/viewOnly'
import { useNavigate } from 'react-router'
import { useCountdowns, countdownsApi, countdownLabel, type Countdown } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { IconPicker } from '@/components/ui/icon-picker'
import { Modal } from '@/components/ui/modal'
import { Card } from '@/components/ui/card'

// Today card: everything the family is counting down to, soonest first. Standalone
// items are addable/removable here; event-flagged and birthday countdowns are derived
// (managed on the event / member profile) and shown read-only.

function fmtDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function Row({
  c,
  sleeps,
  onOpen,
  onRemove,
}: {
  c: Countdown
  sleeps: boolean
  onOpen: () => void
  onRemove?: () => void
}) {
  const soon = c.daysLeft <= 7
  return (
    <div
      className="cd-row cd-row-btn"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <span className="cd-emoji" style={c.color ? { background: `${c.color}22` } : undefined}>
        <DataIcon value={c.emoji ?? '📅'} kind="calendar" />
      </span>
      <div className="cd-main">
        <div className="cd-title">{c.title}</div>
        <div className="tiny muted">{fmtDate(c.date)}</div>
      </div>
      <div className={`cd-days${soon ? ' soon' : ''}`}>{countdownLabel(c.daysLeft, sleeps)}</div>
      {onRemove && (
        <Button
          variant="unstyled"
          type="button"
          className="cd-x"
          aria-label={`Remove ${c.title}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <DataIcon value={'×'} kind="general" />
        </Button>
      )}
    </div>
  )
}

export function CountdownsCard() {
  const { countdowns, sleeps, loading } = useCountdowns()
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()

  // Tapping a countdown takes you to what it's counting down to: an event-based
  // countdown opens that event; standalone/birthday ones jump to the calendar day
  // (where the countdown shows as an all-day chip).
  const openCountdown = (c: Countdown) => {
    if (c.source === 'event') navigate(`/calendar/event/${c.id}`)
    else navigate(`/calendar?date=${c.date}&view=day`)
  }

  return (
    <Card
      className="card cd-card"
      style={{ padding: '22px 22px 12px', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div className="card-h" style={{ fontSize: 23 }}>
          Countdowns
        </div>
        <div className="muted" style={{ fontWeight: 600 }}>
          {countdowns.length}
        </div>
        <Editable>
          <Button
            variant="unstyled"
            type="button"
            className="pill"
            style={{ marginLeft: 'auto', cursor: 'pointer' }}
            onClick={() => setAdding(true)}
          >
            + Add
          </Button>
        </Editable>
      </div>

      {loading && (
        <div className="muted" style={{ padding: '14px 4px' }}>
          Loading…
        </div>
      )}
      {!loading && countdowns.length === 0 && (
        <div className="muted" style={{ padding: '14px 4px' }}>
          Nothing to count down to yet — add a trip, a birthday's automatic.
        </div>
      )}
      {!loading &&
        countdowns.map((c) => (
          <Row
            key={c.id}
            c={c}
            sleeps={sleeps}
            onOpen={() => openCountdown(c)}
            onRemove={c.source === 'standalone' ? () => countdownsApi.remove(c.id) : undefined}
          />
        ))}

      {adding && <AddCountdown onClose={() => setAdding(false)} />}
    </Card>
  )
}

function AddCountdown({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [emoji, setEmoji] = useState('')
  const [saving, setSaving] = useState(false)
  const canSave = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date)

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      await countdownsApi.create({ title: title.trim(), date, emoji: emoji.trim() || null })
    } finally {
      setSaving(false)
    }
    onClose()
  }

  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
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
          New countdown
        </div>
        <div className="cd-form">
          <Label>
            <span>What</span>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hawaii trip"
            />
          </Label>
          <div className="cd-form-row">
            <Label style={{ flex: 1 }}>
              <span>Date</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Label>
            <Label style={{ width: 96 }}>
              <span>Icon</span>
              <IconPicker kind="general" value={emoji} onValueChange={(e) => setEmoji(e)} />
            </Label>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="unstyled" type="button" className="pill" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="unstyled"
            type="button"
            className="pill primary"
            disabled={!canSave || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Add'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
