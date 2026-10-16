// Shared "spot-award" modal — a parent hands a person stars on the spot (not tied
// to a chore). Two modes:
//   • presetPersonId set → skip the picker, award straight to that person
//     (matches the old PersonProfile award button).
//   • no preset → show a family-member picker first; Award stays disabled until
//     one is chosen.
// Writes a positive ledger entry via rewardsApi.awardSpot, which taps 'rewards'
// so balances/jars refetch. Uses the shared modal chrome (.modal-overlay /
// .modal-card / .modal-close) + .field / .field-row + btn btn-primary/ghost.
import { useState } from 'react'
import { rewardsApi, type Currency } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'
import { IconValue } from '@/components/ui/icon-value'
import { SelectField } from '@/components/ui/select-field'

export interface SpotAwardPerson {
  id: string
  name: string
  avatarEmoji?: string | null
  colorHex?: string | null
}

export function SpotAwardModal({
  people,
  presetPersonId,
  currencies,
  onClose,
  onAwarded,
}: {
  people: SpotAwardPerson[]
  presetPersonId?: string
  currencies: Currency[]
  onClose: () => void
  onAwarded?: () => void
}) {
  // Only spendable currencies can be handed out; fall back to the whole list if
  // none are flagged (older catalogs). Default to the household default.
  const spendable = currencies.filter((c) => c.spendable)
  const options = spendable.length > 0 ? spendable : currencies
  const defaultCur = options.find((c) => c.isDefault) ?? options[0]

  const [selectedId, setSelectedId] = useState<string>(presetPersonId ?? '')
  const [amount, setAmount] = useState(5)
  const [currency, setCurrency] = useState(defaultCur?.key ?? 'stars')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const cur = options.find((c) => c.key === currency)
  const selected = people.find((p) => p.id === selectedId) ?? null
  // With a preset we always have a person; otherwise one must be picked.
  const person = presetPersonId
    ? (people.find((p) => p.id === presetPersonId) ?? selected)
    : selected
  const canAward = !!selectedId && amount > 0 && !saving

  async function submit() {
    if (!selectedId || amount <= 0 || saving) return
    setSaving(true)
    try {
      await rewardsApi.awardSpot(selectedId, amount, currency, note.trim() || undefined)
      onAwarded?.()
      onClose()
    } catch {
      setSaving(false)
    }
  }

  const title = person ? `Award stars to ${person.name}` : 'Award stars'

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
          <DataIcon value={'×'} kind="reward" />
        </Button>
        <div className="wf-serif" style={{ fontSize: 22, fontWeight: 600, marginBottom: 14 }}>
          {title}
        </div>

        {/* Family-member picker — only when there's no preset person. */}
        {!presetPersonId && (
          <div className="field" style={{ marginBottom: 12 }}>
            <span>Who?</span>
            <div className="sa-people" role="radiogroup" aria-label="Family member">
              {people.map((p) => {
                const on = p.id === selectedId
                const color = p.colorHex ?? 'var(--ink-2)'
                return (
                  <Button
                    variant="unstyled"
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`sa-person ${on ? 'on' : ''}`}
                    style={on ? { borderColor: color, background: `${color}18` } : undefined}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span
                      className="sa-person-av"
                      style={{ background: p.colorHex ? `${p.colorHex}22` : 'var(--panel)' }}
                    >
                      <DataIcon value={p.avatarEmoji ?? '🙂'} kind="person" />
                    </span>
                    <span className="sa-person-name">{p.name.split(' ')[0]}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        <div className="field-row">
          <Label className="field" style={{ flex: 1 }}>
            <span>Amount</span>
            <Input
              type="number"
              min={1}
              value={amount}
              aria-label="Amount"
              onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          </Label>
          {options.length > 1 ? (
            <Label className="field" style={{ flex: 1 }}>
              <span>Currency</span>
              <SelectField
                aria-label="Currency"
                value={currency}
                onValueChange={(e) => setCurrency(e)}
              >
                {options.map((c) => (
                  <option key={c.key} value={c.key}>
                    <IconValue value={c.symbol} /> {c.label}
                  </option>
                ))}
              </SelectField>
            </Label>
          ) : (
            <Label className="field" style={{ flex: 1 }}>
              <span>Currency</span>
              <span className="pill" style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                <IconValue value={cur?.symbol ?? '⭐'} /> {cur?.label ?? 'Stars'}
              </span>
            </Label>
          )}
        </div>

        <Label className="field">
          <span>Note (optional)</span>
          <Input
            type="text"
            value={note}
            aria-label="Note"
            placeholder="e.g. so helpful today"
            onChange={(e) => setNote(e.target.value)}
          />
        </Label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" type="button" disabled={!canAward} onClick={submit}>
            {saving ? (
              'Awarding…'
            ) : (
              <>
                {'Award '}
                {amount} {<IconValue value={cur?.symbol ?? '⭐'} />}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
