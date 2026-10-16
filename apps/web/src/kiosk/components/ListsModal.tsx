import { useState, type FormEvent } from 'react'
import { groceryApi, listWrites, useTemplates } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { IconPicker } from '@/components/ui/icon-picker'
import { Modal } from '@/components/ui/modal'

// Create OR rename a named list (name + emoji). Pass `list` to edit; pass
// `fromTemplate` to open the create form pre-pointed at a template (the user
// still names the new list); omit both to create a blank list.
export function ListsModal({
  list,
  fromTemplate,
  onClose,
  onCreated,
  onSaved,
}: {
  list?: { id: string; name: string; emoji: string | null }
  fromTemplate?: { id: string; name: string; emoji: string | null }
  onClose: () => void
  onCreated?: (id: string) => void
  onSaved?: () => void
}) {
  const editing = !!list
  // Pre-point at a template? Seed the name from it as a starting point (the user
  // can rename); the new list's emoji comes from the template server-side.
  const [name, setName] = useState(list?.name ?? fromTemplate?.name ?? '')
  const [emoji, setEmoji] = useState(list?.emoji ?? '')
  const [saving, setSaving] = useState(false)
  // Saved templates to start a fresh list from (create flow only).
  const { templates } = useTemplates()

  // Apply a template → a fresh list with everything unchecked, then select it.
  async function applyTemplate(id: string) {
    if (saving) return
    setSaving(true)
    try {
      const created = await groceryApi.applyTemplate(id, name.trim() || undefined)
      onCreated?.(created.id)
      onClose()
    } catch {
      setSaving(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (editing) {
        await listWrites.renameList(list.id, { name: name.trim(), emoji: emoji.trim() || null })
        onSaved?.()
      } else if (fromTemplate) {
        const created = await groceryApi.applyTemplate(fromTemplate.id, name.trim())
        onCreated?.(created.id)
      } else {
        const created = await listWrites.createList({
          name: name.trim(),
          emoji: emoji.trim() || null,
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
        <div
          className="wf-serif"
          style={{ fontSize: 20, fontWeight: 600, marginBottom: fromTemplate ? 6 : 14 }}
        >
          {editing ? 'Rename list' : fromTemplate ? 'New list from template' : 'New list'}
        </div>
        {fromTemplate && (
          <div className="tiny muted" style={{ marginBottom: 14 }}>
            From{' '}
            <strong>
              <DataIcon value={fromTemplate.emoji ?? '📑'} kind="list" /> {fromTemplate.name}
            </strong>{' '}
            — name your new list.
          </div>
        )}
        <form onSubmit={submit}>
          <div className="field-row">
            <Label className="field" style={{ flex: 3 }}>
              <span>List name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lake trip packing"
                autoFocus
              />
            </Label>
            {!fromTemplate && (
              <Label className="field" style={{ flex: 1 }}>
                <span>Icon</span>
                <IconPicker kind="list" value={emoji} onValueChange={(e) => setEmoji(e)} />
              </Label>
            )}
          </div>
          <Button
            variant="default"
            type="submit"

            disabled={!name.trim() || saving}
            style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
          >
            {saving
              ? 'Saving…'
              : editing
                ? 'Save changes'
                : fromTemplate
                  ? 'Create from template'
                  : 'Create list'}
          </Button>
        </form>

        {!editing && !fromTemplate && templates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="tiny muted" style={{ fontWeight: 600, marginBottom: 8 }}>
              Or apply a template
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {templates.map((t) => (
                <Button
                  variant="unstyled"
                  key={t.id}
                  type="button"
                  className="pill"
                  style={{ cursor: 'pointer' }}
                  disabled={saving}
                  onClick={() => applyTemplate(t.id)}
                >
                  <span>
                    <DataIcon value={t.emoji ?? '📑'} kind="list" />
                  </span>{' '}
                  {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
