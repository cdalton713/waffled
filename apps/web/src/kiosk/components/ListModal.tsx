import { useState, type FormEvent } from 'react'
import { api, usePersons, type GoalList } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { IconPicker } from '@/components/ui/icon-picker'
import { Modal } from '@/components/ui/modal'
import { Checkbox } from '@/components/ui/checkbox'

// Create OR edit a goal list (membership group) — name, emoji, members, privacy.
// Pass `list` to edit an existing one; omit it to create a new one.
export function ListModal({
  list,
  onClose,
  onCreated,
  onSaved,
}: {
  list?: GoalList
  onClose: () => void
  onCreated?: (id: string) => void
  onSaved?: () => void
}) {
  const { persons } = usePersons()
  const editing = !!list
  const [name, setName] = useState(list?.name ?? '')
  const [emoji, setEmoji] = useState(list?.emoji ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(list?.members.map((m) => m.personId) ?? [])
  const [isPrivate, setIsPrivate] = useState(list?.isPrivate ?? false)
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) =>
    setMemberIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (editing) {
        await api.updateGoalList(list.id, {
          name: name.trim(),
          emoji: emoji.trim() || null,
          memberIds,
          isPrivate,
        })
        onSaved?.()
      } else {
        const { list: created } = await api.createGoalList({
          name: name.trim(),
          emoji: emoji.trim() || null,
          memberIds,
          isPrivate,
        })
        onCreated?.(created.id)
      }
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
          {editing ? 'Edit group' : 'New goal list'}
        </div>
        <form onSubmit={submit}>
          <div className="field-row">
            <Label className="field" style={{ flex: 3 }}>
              <span>List name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mom & Dad"
                autoFocus
              />
            </Label>
            <Label className="field" style={{ flex: 1 }}>
              <span>Icon</span>
              <IconPicker kind="list" value={emoji} onValueChange={(e) => setEmoji(e)} />
            </Label>
          </div>

          <div className="field">
            <span>Who’s on this list?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {persons.map((p) => {
                const on = memberIds.includes(p.id)
                const color = p.colorHex ?? '#6B6B70'
                return (
                  <Button
                    variant="unstyled"
                    type="button"
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: on ? `1.5px solid ${color}` : '1px solid var(--hair)',
                      background: on ? `${color}22` : 'var(--card-2)',
                      color: 'var(--ink)',
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

          <Label
            className="field"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Checkbox
              checked={isPrivate}
              onCheckedChange={(e) => setIsPrivate(e === true)}
              style={{ width: 'auto' }}
            />
            <span style={{ margin: 0 }}>Private — only these members see it</span>
          </Label>

          <Button
            variant="default"
            type="submit"
            disabled={!name.trim() || saving}
            style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create list'}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
