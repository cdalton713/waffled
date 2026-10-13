// In-app confirm/prompt dialog — replaces native window.confirm/prompt/alert so
// destructive and input actions match the app's look. With `input`, it doubles as
// a prompt (e.g. rename) and passes the entered value to onConfirm.
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  input,
  onConfirm,
  onClose,
}: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  input?: { label?: string; placeholder?: string; initial?: string }
  onConfirm: (value?: string) => void | Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(input?.initial ?? '')
  const [busy, setBusy] = useState(false)

  async function confirm(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    if (input && !value.trim()) return
    setBusy(true)
    try {
      await onConfirm(input ? value.trim() : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} style={{ maxWidth: 400 }} {...(!message ? { 'aria-describedby': undefined } : {})}>
      <form onSubmit={confirm}>
        <DialogTitle style={{ marginBottom: message || input ? 8 : 16 }}>{title}</DialogTitle>
        {message && <DialogDescription style={{ marginBottom: input ? 14 : 18 }}>{message}</DialogDescription>}
        {input && (
          <label className="field" style={{ marginBottom: 16 }}>
            {input.label && <span>{input.label}</span>}
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={input.placeholder} autoFocus />
          </label>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button
            type="submit"
            variant={danger ? 'destructive' : 'default'}
            style={danger ? { background: 'var(--danger)', borderColor: 'transparent' } : undefined}
            disabled={busy || (!!input && !value.trim())}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  )
}
