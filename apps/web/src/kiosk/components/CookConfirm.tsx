import { useState } from 'react'
import { pantryApi, type RecipeMatch, type ConsumeMode } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'

// "Used from your pantry" — shown after marking a recipe cooked. Lists the on-hand
// items that recipe likely used, each pre-set to a sensible action (staples default to
// "Didn't use"). Confirming decrements/uses-up the chosen items; skipping changes
// nothing. Because units never line up cleanly, we don't pretend to subtract exact
// amounts — you confirm in a tap.

const MODES: { key: ConsumeMode; label: string }[] = [
  { key: 'decrement', label: 'Used some' },
  { key: 'used_up', label: 'Used it up' },
  { key: 'skip', label: "Didn't use" },
]

export function CookConfirm({
  title,
  matches,
  onClose,
  onApplied,
}: {
  title: string
  matches: RecipeMatch[]
  onClose: () => void
  onApplied?: (count: number) => void
}) {
  const [choice, setChoice] = useState<Record<string, ConsumeMode>>(() =>
    Object.fromEntries(matches.map((m) => [m.id, m.suggested])),
  )
  const [busy, setBusy] = useState(false)

  async function confirm() {
    const items = matches
      .map((m) => ({ id: m.id, mode: choice[m.id] }))
      .filter(
        (x): x is { id: string; mode: 'used_up' | 'decrement' } =>
          x.mode === 'used_up' || x.mode === 'decrement',
      )
    setBusy(true)
    try {
      if (items.length) await pantryApi.consume(items)
    } catch {
      /* non-fatal */
    }
    setBusy(false)
    onApplied?.(items.length)
    onClose()
  }

  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card cc-modal" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="unstyled"
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <DataIcon value={'×'} kind="meal" />
        </Button>
        <div className="cc-head">
          <h2 className="cc-title">Used from your pantry</h2>
          <p className="cc-sub">Update your pantry after cooking {title}.</p>
        </div>
        <div className="cc-rows">
          {matches.map((m) => (
            <div key={m.id} className={`cc-row${m.isStaple ? ' staple' : ''}`}>
              <div className="cc-item">
                <span className="cc-name">{m.name}</span>
                <span className="cc-have">
                  {[m.amount, m.unit].filter(Boolean).join(' ') || 'on hand'}
                  {m.isStaple && <span className="cc-staple"> · staple</span>}
                </span>
              </div>
              <div
                className="cc-seg"
                role="radiogroup"
                aria-label={`How much ${m.name} did you use?`}
              >
                {MODES.map((opt) => (
                  <Button
                    variant="unstyled"
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={choice[m.id] === opt.key}
                    className={`cc-seg-btn${choice[m.id] === opt.key ? ' on' : ''}`}
                    onClick={() => setChoice((c) => ({ ...c, [m.id]: opt.key }))}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="cc-foot">
          <Button variant="unstyled" type="button" className="pill" onClick={onClose}>
            Not now
          </Button>
          <Button
            variant="unstyled"
            type="button"
            className="pill primary"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? 'Updating…' : 'Update pantry'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
