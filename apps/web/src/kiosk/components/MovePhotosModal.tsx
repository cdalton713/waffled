import { useState, type FormEvent } from 'react'
import { AlbumPicker } from './AlbumPicker'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

// Bulk "move to album" dialog for the Photos select mode. Picks an existing album or
// a new one (empty = remove from any album) and reports it to onMove. Matches the app
// modal chrome (.modal-overlay / .modal-card) used by ConfirmDialog.

export function MovePhotosModal({
  count,
  albums,
  onMove,
  onClose,
}: {
  count: number
  albums: string[]
  onMove: (album: string) => void | Promise<void>
  onClose: () => void
}) {
  const [album, setAlbum] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onMove(album.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{ maxWidth: 400 }}
      >
        <div className="wf-serif" style={{ fontSize: 19, fontWeight: 600, marginBottom: 12 }}>
          Move {count === 1 ? 'photo' : `${count} photos`} to…
        </div>
        <Label className="ap-field-label" style={{ marginBottom: 18 }}>
          Album
          <AlbumPicker value={album} onChange={setAlbum} albums={albums} />
        </Label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="default" type="submit" disabled={busy}>
            {busy ? 'Moving…' : 'Move'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
