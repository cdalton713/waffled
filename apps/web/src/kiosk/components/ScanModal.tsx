import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import {
  pantryApi,
  flaggedAllergens,
  ALLERGEN_LABELS,
  productSourceLabel,
  type OffProduct,
  type PantryItemInput,
} from '../../lib/api'
import { AllergenBadge } from './Allergens'
import { LocationField } from './LocationField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'

// Barcode scan-into-pantry. Uses the device camera (zxing decoder, which works in
// Chrome/Edge/Android and Safari/iOS) to read a barcode, looks it up via Open Food
// Facts, and adds it — then keeps scanning for a rapid stocking loop.
//
// The camera needs a SECURE CONTEXT (https or localhost). On a plain-http LAN origin
// window.isSecureContext is false and getUserMedia is blocked, so we surface a clear
// warning and fall back to typing the barcode. (HTTPS is a documented requirement.)
export function ScanModal({
  locations,
  avoidAllergens,
  allergenPeople,
  onClose,
  onAdded,
  onLocationsChanged,
}: {
  locations: string[]
  avoidAllergens: string[]
  allergenPeople: Record<string, string[]>
  onClose: () => void
  onAdded: () => void
  onLocationsChanged: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const acceptRef = useRef(true) // gate: stop accepting scans while a result is shown
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })

  const secure = typeof window !== 'undefined' && window.isSecureContext
  const [camErr, setCamErr] = useState<'secure' | 'nocam' | null>(secure ? null : 'secure')
  const [found, setFound] = useState<OffProduct | null | undefined>(undefined) // undefined = scanning
  const [code, setCode] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState(locations[0] ?? 'Pantry')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [note, setNote] = useState('')
  const [lowAt, setLowAt] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)

  async function handleCode(raw: string) {
    if (!acceptRef.current) return
    const c = raw.replace(/\D/g, '')
    const now = Date.now()
    if (!c || (c === lastRef.current.code && now - lastRef.current.at < 4000)) return
    lastRef.current = { code: c, at: now }
    acceptRef.current = false
    setCode(c)
    const p = await pantryApi.lookup(c)
    if (p) {
      setFound(p)
      setName(p.name ?? '')
    } else {
      setFound(null)
      setName('')
    }
  }

  // Start the camera decoder once (cleanup stops the stream).
  useEffect(() => {
    if (!secure) return
    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && !cancelled) void handleCode(result.getText())
      })
      .then((c) => {
        if (cancelled) c.stop()
        else controlsRef.current = c
      })
      .catch(() => setCamErr('nocam'))
    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function resume() {
    setFound(undefined)
    setCode(null)
    setName('')
    setAmount('1')
    setUnit('')
    setExpiresOn('')
    setNote('')
    setLowAt('')
    setShowMore(false)
    acceptRef.current = true
  }

  async function add() {
    if (busy) return
    setBusy(true)
    const input: PantryItemInput = {
      name: name.trim() || 'Item',
      amount: amount.trim(),
      location,
      unit: unit.trim() || undefined,
      expiresOn: expiresOn || undefined,
      note: note.trim() || undefined,
      lowAt: lowAt.trim() === '' ? undefined : Number(lowAt),
    }
    if (found)
      Object.assign(input, {
        barcode: found.barcode,
        brand: found.brand,
        imageUrl: found.imageUrl,
        quantityText: found.quantityText,
        servingBasis: found.servingBasis,
        nutrition: found.nutrition,
        allergens: found.allergens,
        traces: found.traces,
        dietary: found.dietary,
        source: found.source,
      })
    else if (code) input.barcode = code
    try {
      const r = await pantryApi.scan(input)
      setAdded((n) => n + 1)
      setFlash(
        `${r.incremented ? 'Updated' : 'Added'} ${r.item.name} — now ${r.item.amount || '1'}${r.item.unit ? ' ' + r.item.unit : ''}`,
      )
      onAdded()
      resume()
    } finally {
      setBusy(false)
    }
  }

  async function lookupManual() {
    const c = manual.replace(/\D/g, '')
    if (!c) return
    setManual('')
    acceptRef.current = true
    await handleCode(c)
  }

  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card pl-scan" onClick={(e) => e.stopPropagation()}>
        <div className="pl-scan-head">
          <span className="wf-serif pl-scan-title">Scan into pantry</span>
          {added > 0 && (
            <span className="pl-scan-count">
              <>
                <DataIcon value={'✓'} kind="general" />{' '}
              </>
              {added} added
            </span>
          )}
          <Button
            variant="unstyled"
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <DataIcon value={'×'} kind="general" />
          </Button>
        </div>

        <div className="pl-scan-body">
          <div className="pl-scan-cam">
            {camErr ? (
              <div className="pl-scan-warn">
                <div className="pl-scan-warn-h">
                  <>
                    <DataIcon value={'📷'} kind="general" />
                    {' Camera unavailable'}
                  </>
                </div>
                <div className="pl-scan-warn-t">
                  {camErr === 'secure'
                    ? 'The camera needs a secure connection (HTTPS, or localhost on this computer). On a plain http:// address it’s blocked by the browser — type the barcode instead.'
                    : 'Couldn’t start the camera (permission denied or no camera). Type the barcode instead.'}
                </div>
              </div>
            ) : (
              <div className="pl-scan-viewport">
                <video ref={videoRef} className="pl-scan-video" muted playsInline />
                <div className="pl-scan-reticle" aria-hidden>
                  <span className="pl-rt tl" />
                  <span className="pl-rt tr" />
                  <span className="pl-rt bl" />
                  <span className="pl-rt br" />
                </div>
              </div>
            )}
            <div className="pl-scan-manual">
              <Input
                value={manual}
                placeholder="Type a barcode"
                inputMode="numeric"
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    lookupManual()
                  }
                }}
              />
              <Button
                variant="unstyled"
                type="button"
                className="pill btn-primary"
                disabled={!manual.trim()}
                onClick={lookupManual}
              >
                Look up
              </Button>
            </div>
          </div>

          <div className="pl-scan-result">
            {found === undefined && (
              <div className="pl-scan-idle">
                {flash && (
                  <div className="pl-scan-flash">
                    <>
                      <DataIcon value={'✓'} kind="general" />{' '}
                    </>
                    {flash}
                  </div>
                )}
                {camErr ? 'Type a barcode to look it up.' : 'Point the camera at a barcode…'}
              </div>
            )}

            {found !== undefined && (
              <>
                {found ? (
                  <>
                    <div className="pl-scan-prod">
                      {productSourceLabel(found.source) && (
                        <span className="pl-off-tag">
                          <>
                            <DataIcon value={'●'} kind="general" />{' '}
                          </>
                          {productSourceLabel(found.source)}
                        </span>
                      )}
                      {found.imageUrl ? (
                        <img className="pl-scan-prodimg" src={found.imageUrl} alt="" />
                      ) : (
                        <span className="pl-scan-prodemoji">
                          {found.source === 'openfoodfacts' ? (
                            <DataIcon value={'🥫'} kind="general" />
                          ) : (
                            <DataIcon value={'📦'} kind="general" />
                          )}
                        </span>
                      )}
                      <div className="pl-scan-prodname">{found.name}</div>
                      {found.brand && <div className="pl-scan-prodbrand">{found.brand}</div>}
                      {found.allergens.length > 0 &&
                        (() => {
                          const flag = new Set(
                            flaggedAllergens(
                              { allergens: found.allergens },
                              avoidAllergens,
                              allergenPeople,
                            ),
                          )
                          const affects = Array.from(
                            new Set([...flag].flatMap((a) => allergenPeople[a] ?? [])),
                          )
                          return (
                            <>
                              <div className="pl-scan-allergens">
                                {found.allergens.map((a) => (
                                  <span key={a} className="pl-contains-item">
                                    <AllergenBadge allergen={a} avoid={flag.has(a)} />{' '}
                                    {ALLERGEN_LABELS[a] ?? a}
                                  </span>
                                ))}
                              </div>
                              {flag.size > 0 && (
                                <div className="pl-affects">
                                  <>
                                    <DataIcon value={'⚠'} kind="general" />
                                    {' Contains '}
                                  </>
                                  {[...flag].map((a) => ALLERGEN_LABELS[a] ?? a).join(', ')}
                                  {affects.length ? ` — affects ${affects.join(', ')}` : ''}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      {found.traces.length > 0 && (
                        <div className="pl-scan-allergens">
                          <span className="pl-contains-l">May contain</span>
                          {found.traces.map((a) => (
                            <span key={a} className="pl-contains-item">
                              <AllergenBadge
                                allergen={a}
                                trace
                                avoid={avoidAllergens.includes(a) || !!allergenPeople[a]}
                              />{' '}
                              {ALLERGEN_LABELS[a] ?? a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="pl-scan-prod">
                    <span className="pl-scan-prodemoji">
                      <DataIcon value={'📦'} kind="general" />
                    </span>
                    <div className="pl-scan-prodname">Not found in a product database</div>
                    <div className="pl-scan-prodbrand">
                      Barcode {code} — name it and add manually.
                    </div>
                    <Input
                      className="pl-scan-nameinput"
                      value={name}
                      autoFocus
                      placeholder="Item name"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                )}

                <div className="pl-scan-fields">
                  <Label>
                    <span>Where</span>
                    <LocationField
                      value={location}
                      locations={locations}
                      onChange={setLocation}
                      onLocationsChanged={onLocationsChanged}
                    />
                  </Label>
                  <Label>
                    <span>Amount</span>
                    <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Label>
                </div>

                {!showMore ? (
                  <Button
                    variant="unstyled"
                    type="button"
                    className="pl-scan-more"
                    onClick={() => setShowMore(true)}
                  >
                    + Unit, expiry, note, warn-below
                  </Button>
                ) : (
                  <div className="pl-scan-more-grid">
                    <Label>
                      <span>Unit</span>
                      <Input
                        value={unit}
                        placeholder="bag / lbs"
                        onChange={(e) => setUnit(e.target.value)}
                      />
                    </Label>
                    <Label>
                      <span>Expires</span>
                      <Input
                        type="date"
                        value={expiresOn}
                        onChange={(e) => setExpiresOn(e.target.value)}
                      />
                    </Label>
                    <Label>
                      <span>Warn below</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={lowAt}
                        placeholder="default"
                        onChange={(e) => setLowAt(e.target.value)}
                      />
                    </Label>
                    <Label className="pl-scan-more-note">
                      <span>Note</span>
                      <Input value={note} onChange={(e) => setNote(e.target.value)} />
                    </Label>
                  </div>
                )}

                <div className="pl-scan-acts">
                  <Button
                    variant="unstyled"
                    type="button"
                    className="pill btn-primary"
                    disabled={busy}
                    onClick={resume}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="unstyled"
                    type="button"
                    className="pill btn-primary"
                    style={{ color: 'var(--on-accent)', border: 0 }}
                    disabled={busy || (!found && !name.trim())}
                    onClick={add}
                  >
                    {busy ? 'Adding…' : 'Add & scan next'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pl-scan-foot">
          <Button variant="unstyled" type="button" className="pill btn-primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
