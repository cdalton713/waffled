import { useState } from 'react'
import { conversionsApi, type Conversion } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DataIcon } from '@/components/ui/data-icon'
import { SelectField } from '@/components/ui/select-field'
import { Modal } from '@/components/ui/modal'
import { IconValue } from '@/components/ui/icon-value'

// Trade one currency for another for a specific person (the canonical home is the
// person profile, where their balances live). Anyone can convert their own
// balance; guarded on sufficient funds.
export function TradeModal({
  person,
  balances,
  conversions,
  onClose,
  onDone,
}: {
  person: { id: string; name: string | null }
  balances: { currency: string; balance: number }[]
  conversions: Conversion[]
  onClose: () => void
  onDone?: () => void
}) {
  const [convId, setConvId] = useState(conversions[0]?.id ?? '')
  const [times, setTimes] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const conv = conversions.find((c) => c.id === convId)
  const have = conv ? (balances.find((x) => x.currency === conv.fromCurrency)?.balance ?? 0) : 0
  const cost = conv ? conv.fromAmount * times : 0
  const gain = conv ? conv.toAmount * times : 0
  const afford = !!conv && have >= cost && times > 0

  async function go() {
    if (!conv || !afford) return
    setBusy(true)
    setErr(null)
    try {
      await conversionsApi.apply(conv.id, person.id, times)
      onDone?.()
      onClose()
    } catch {
      setErr('Couldn’t complete that trade.')
      setBusy(false)
    }
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
        <div className="wf-serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 2 }}>
          Trade currencies
        </div>
        <div className="tiny muted" style={{ fontWeight: 600, marginBottom: 14 }}>
          for {person.name}
        </div>

        <Label className="field">
          <span>Trade</span>
          <SelectField value={convId} onValueChange={(e) => setConvId(e)}>
            {conversions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fromAmount} <IconValue value={c.from.symbol ?? ''} />{' '}
                {c.from.label ?? c.fromCurrency}
                <>
                  {' '}
                  <DataIcon value={'→'} kind="general" />{' '}
                </>
                {c.toAmount} <IconValue value={c.to.symbol ?? ''} /> {c.to.label ?? c.toCurrency}
              </option>
            ))}
          </SelectField>
        </Label>
        <Label
          className="field"
          style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: 'row' }}
        >
          <span style={{ margin: 0 }}>How many times</span>
          <div className="rw-cost-input">
            <Button
              variant="unstyled"
              type="button"
              onClick={() => setTimes((t) => Math.max(1, t - 1))}
              style={{ border: 0, background: 'none', fontSize: 18, cursor: 'pointer' }}
            >
              −
            </Button>
            <Input
              type="number"
              min={1}
              value={times}
              onChange={(e) => setTimes(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Times"
            />
            <Button
              variant="unstyled"
              type="button"
              onClick={() => setTimes((t) => t + 1)}
              style={{ border: 0, background: 'none', fontSize: 18, cursor: 'pointer' }}
            >
              +
            </Button>
          </div>
        </Label>

        {conv && (
          <div className="rw-trade-summary">
            <span className="rw-trade-give">
              −{cost} <IconValue value={conv.from.symbol ?? ''} />
            </span>
            <span className="conv-arrow">
              <DataIcon value={'→'} kind="general" />
            </span>
            <span className="rw-trade-get">
              +{gain} <IconValue value={conv.to.symbol ?? ''} />
            </span>
            <span className="tiny muted" style={{ marginLeft: 'auto' }}>
              has {have} <IconValue value={conv.from.symbol ?? ''} />
            </span>
          </div>
        )}
        {!afford && conv && (
          <div className="tiny" style={{ color: 'var(--primary)', fontWeight: 700, marginTop: 6 }}>
            Not enough {conv.from.label ?? 'currency'} to trade {times}
            <>
              <DataIcon value={'×'} kind="general" />
              {'.'}
            </>
          </div>
        )}
        {err && (
          <div className="tiny" style={{ color: 'var(--primary)', fontWeight: 700, marginTop: 6 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="unstyled" type="button" className="pill btn-primary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="unstyled"
            type="button"
            className="pill btn-primary"
            style={{ color: 'var(--on-accent)', border: 0 }}
            disabled={busy || !afford}
            onClick={go}
          >
            {busy ? 'Trading…' : 'Trade'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
