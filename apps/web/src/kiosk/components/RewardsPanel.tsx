import { useCallback, useEffect, useMemo, useState } from 'react'
import { useViewOnly } from '../../lib/viewOnly'
import {
  rewardsApi,
  useRewardsHub,
  useHousehold,
  usePersonOverview,
  can,
  type Reward,
  type Currency,
} from '../../lib/api'
import { SpotAwardModal } from './SpotAwardModal'
import '../../styles/shop.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataIcon } from '@/components/ui/data-icon'
import { IconPicker } from '@/components/ui/icon-picker'
import { Modal } from '@/components/ui/modal'
import { IconValue } from '@/components/ui/icon-value'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'

// The five reward-shop categories (backend stores the key; the shop renders the
// emoji + label + a per-category thumb gradient). `null`/unknown → "Other".
export const SHOP_CATEGORIES = [
  { key: 'treats', label: 'Treats', emoji: '🍦', grad: 'linear-gradient(135deg,#FBDCC4,#F3B183)' },
  {
    key: 'screen',
    label: 'Screen time',
    emoji: '📺',
    grad: 'linear-gradient(135deg,#D3E2FB,#9DC0F2)',
  },
  {
    key: 'adventures',
    label: 'Adventures',
    emoji: '🎢',
    grad: 'linear-gradient(135deg,#D9EDD2,#A9D59A)',
  },
  { key: 'toys', label: 'Toys', emoji: '🧸', grad: 'linear-gradient(135deg,#EEDAF7,#CFA9E8)' },
  {
    key: 'privileges',
    label: 'Privileges',
    emoji: '👑',
    grad: 'linear-gradient(135deg,#FBDCC4,#F3B183)',
  },
] as const

const CAT_BY_KEY = new Map<string, (typeof SHOP_CATEGORIES)[number]>(
  SHOP_CATEGORIES.map((c) => [c.key, c]),
)
function catOf(key: string | null | undefined) {
  return (key && CAT_BY_KEY.get(key)) || null
}
const DEFAULT_GRAD = 'linear-gradient(135deg,#EEDAF7,#CFA9E8)'

function Avatar({
  emoji,
  color,
  name,
  size = 30,
}: {
  emoji: string | null
  color: string | null
  name: string | null
  size?: number
}) {
  return (
    <span
      className="shop-av"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: color ? `${color}22` : 'var(--panel)',
      }}
      title={name ?? ''}
    >
      <DataIcon value={emoji ?? '🙂'} kind="person" />
    </span>
  )
}

// The "spend" side of the economy, redesigned as a kid-facing Reward Shop: a
// per-kid wallet hero + a filterable tile catalog they redeem against. Currencies
// come from the household catalog (Settings → Chores & rewards). Parents keep the
// approvals queue, the reward editor, archived rewards, and capability gating.
export function RewardsPanel() {
  const { rewards, balances, currencies, pending, loading, error, refetch } = useRewardsHub()
  const { person } = useHousehold()
  // Capability-gated: manage = add/edit/delete + archived; approve = redemption
  // queue; grant = spot-award stars. Members who can't manage still shop & redeem.
  const canManage = can(person, 'reward.manage')
  const viewOnly = useViewOnly()
  const canApprove = can(person, 'reward.approve')
  const canGrant = can(person, 'reward.grant')

  // Only kids/teens hold wallets in the shop — the roster is everyone with a balance.
  const kids = balances
  // Active kid = the logged-in kid if they're in the roster, else the first kid.
  const [activeKidId, setActiveKidId] = useState<string | null>(null)
  useEffect(() => {
    if (kids.length === 0) {
      setActiveKidId(null)
      return
    }
    setActiveKidId((cur) => {
      if (cur && kids.some((k) => k.personId === cur)) return cur
      const mine = person && kids.find((k) => k.personId === person.id)
      return (mine ?? kids[0]).personId
    })
  }, [kids, person])
  const activeKid = kids.find((k) => k.personId === activeKidId) ?? null
  // Redeeming spends a wallet: your own is always yours to spend, someone else's
  // needs reward.manage — the same rule the server enforces, so we render the
  // affordance only when it would succeed.
  const canRedeemActive = !!activeKid && (canManage || activeKid.personId === person?.id)

  const [category, setCategory] = useState<string>('all')
  const [redeemFor, setRedeemFor] = useState<Reward | null>(null)
  const [celebrate, setCelebrate] = useState<{ reward: Reward; pending: boolean } | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Reward | null>(null)
  const [awarding, setAwarding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Archived (soft-deleted) rewards — admin only, collapsed section.
  const [archived, setArchived] = useState<Reward[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const loadArchived = useCallback(() => {
    if (!canManage) return
    rewardsApi
      .archivedRewards()
      .then((d) => setArchived(d.rewards))
      .catch(() => setArchived([]))
  }, [canManage])
  useEffect(() => {
    loadArchived()
  }, [loadArchived, rewards.length])
  const afterCatalogChange = () => {
    refetch()
    loadArchived()
  }
  async function restore(id: string) {
    setBusy(id)
    try {
      await rewardsApi.restoreReward(id)
      afterCatalogChange()
    } finally {
      setBusy(null)
    }
  }

  const curOf = (key: string) => currencies.find((c) => c.key === key)
  const balanceOf = (personId: string, key: string) =>
    balances.find((b) => b.personId === personId)?.balances.find((x) => x.currency === key)
      ?.balance ?? 0

  // The active kid's wallet, in the default currency (the shop is star-first).
  const defaultCur = currencies.find((c) => c.isDefault) ?? currencies[0]
  const walletKey = defaultCur?.key ?? 'stars'
  const walletBalance = activeKid ? balanceOf(activeKid.personId, walletKey) : 0

  // "Saving toward" comes from the person overview endpoint (balance-derived).
  const overview = usePersonOverview(activeKidId)
  const savingToward = overview.data?.savingToward ?? null

  // Which categories actually have rewards → only show chips that filter to something.
  const presentCats = useMemo(() => {
    const keys = new Set(rewards.map((r) => r.category).filter(Boolean) as string[])
    return SHOP_CATEGORIES.filter((c) => keys.has(c.key))
  }, [rewards])
  const shown = category === 'all' ? rewards : rewards.filter((r) => r.category === category)

  async function redeem(reward: Reward) {
    if (!activeKid) return
    setBusy(reward.id)
    try {
      await rewardsApi.redeem(reward.id, activeKid.personId)
      setRedeemFor(null)
      setCelebrate({ reward, pending: reward.requiresApproval })
      refetch()
    } finally {
      setBusy(null)
    }
  }
  async function decide(id: string, approve: boolean) {
    setBusy(id)
    try {
      await (approve ? rewardsApi.approve(id) : rewardsApi.deny(id))
      refetch()
    } catch {
      refetch()
    } finally {
      setBusy(null)
    }
  }

  if (loading)
    return (
      <div className="muted" style={{ padding: 20 }}>
        Loading…
      </div>
    )
  if (error)
    return (
      <div className="muted" style={{ padding: 20 }}>
        Couldn't load rewards — try reloading or signing in again.
      </div>
    )

  const walletSym = defaultCur?.symbol ?? '⭐'

  return (
    <div className="shop">
      {/* header — title + family chips + parent award button */}
      <div className="shop-head">
        <div className="shop-kids" role="tablist" aria-label="Family members">
          {kids.map((k) => {
            const on = k.personId === activeKidId
            const bal = balanceOf(k.personId, walletKey)
            return (
              <Button
                variant="unstyled"
                key={k.personId}
                type="button"
                role="tab"
                aria-selected={on}
                className={`shop-kid ${on ? 'on' : ''}`}
                onClick={() => setActiveKidId(k.personId)}
                title={`${k.name}’s stars`}
              >
                <Avatar emoji={k.avatarEmoji} color={k.colorHex} name={k.name} />
                <span className="shop-kid-name">{(k.name ?? '').split(' ')[0]}</span>
                <span className="shop-kid-bal">
                  <IconValue value={walletSym} /> {bal}
                </span>
              </Button>
            )
          })}
        </div>
        {canGrant && kids.length > 0 && (
          <Button
            variant="default"
            type="button"
            className="shop-award-btn"
            onClick={() => setAwarding(true)}
          >
            <>
              <DataIcon value={'＋'} kind="reward" />
              {' Award stars'}
            </>
          </Button>
        )}
      </div>

      {/* approvals — only for those who can approve redemptions */}
      {canApprove && pending.length > 0 && (
        <Card className="card shop-approvals">
          <div className="card-h" style={{ marginBottom: 10 }}>
            Needs your OK
          </div>
          {pending.map((p) => (
            <div key={p.id} className="shop-appr">
              <Avatar emoji={p.personAvatar} color={p.personColor} name={p.personName} />
              <div className="shop-appr-txt">
                <span className="shop-appr-name">{p.personName}</span> wants{' '}
                <span className="shop-appr-reward">
                  {p.emoji ? <>{<DataIcon value={p.emoji} kind="reward" />} </> : ''}
                  {p.title}
                </span>
                <span className="shop-appr-cost">
                  <IconValue value={curOf(p.currency)?.symbol ?? '⭐'} /> {p.cost}
                </span>
              </div>
              <div className="shop-appr-actions">
                <Button
                  variant="ghost"
                  type="button"
                  className="shop-sm"
                  disabled={busy === p.id}
                  onClick={() => decide(p.id, false)}
                >
                  Deny
                </Button>
                <Button
                  variant="default"
                  type="button"
                  className="shop-sm"
                  disabled={busy === p.id}
                  onClick={() => decide(p.id, true)}
                >
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* hero — active kid's wallet + saving-toward panel */}
      {activeKid && (
        <div className="shop-hero">
          <div className="shop-hero-wallet">
            <div className="shop-coin" aria-hidden>
              <DataIcon value={'★'} kind="reward" />
            </div>
            <div>
              <div className="shop-wallet-label">
                {(activeKid.name ?? 'MY').toUpperCase()}'S STARS
              </div>
              <div className="shop-wallet-big">
                {walletBalance}{' '}
                <span className="shop-wallet-star">
                  <DataIcon value={'★'} kind="reward" />
                </span>{' '}
                to spend
              </div>
              <div className="shop-wallet-sub">
                <>
                  {'Earned from chores this week '}
                  <DataIcon value={'🎉'} kind="reward" />
                </>
              </div>
            </div>
          </div>
          <div className="shop-saving">
            <div className="shop-saving-label">SAVING UP FOR</div>
            {savingToward ? (
              <>
                <div className="shop-saving-row">
                  <span className="shop-saving-emo">
                    <DataIcon value={savingToward.emoji ?? '🎁'} kind="reward" />
                  </span>
                  <span className="shop-saving-title">{savingToward.title}</span>
                </div>
                <div className="shop-progress">
                  <div
                    className="shop-progress-fill"
                    style={{ width: `${Math.min(100, savingToward.pct)}%` }}
                  />
                </div>
                <div className="shop-saving-go">
                  {savingToward.toGo}
                  <>
                    {' '}
                    <DataIcon value={'★'} kind="reward" />
                    {' to go — keep earning!'}
                  </>
                </div>
              </>
            ) : (
              <div className="shop-saving-empty">No goal picked yet</div>
            )}
          </div>
        </div>
      )}

      {/* category chips */}
      {rewards.length > 0 && (
        <div className="shop-cats" role="tablist" aria-label="Reward categories">
          <Button
            variant="unstyled"
            type="button"
            role="tab"
            aria-selected={category === 'all'}
            className={`shop-cat ${category === 'all' ? 'on' : ''}`}
            onClick={() => setCategory('all')}
          >
            All
          </Button>
          {presentCats.map((c) => (
            <Button
              variant="unstyled"
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              className={`shop-cat ${category === c.key ? 'on' : ''}`}
              onClick={() => setCategory(c.key)}
            >
              <span aria-hidden>
                <DataIcon value={c.emoji} kind="reward" />
              </span>{' '}
              {c.label}
            </Button>
          ))}
        </div>
      )}

      {/* catalog manage row */}
      {canManage && !viewOnly && (
        <div className="shop-manage">
          <Button variant="ghost" type="button" className="shop-sm" onClick={() => setAdding(true)}>
            <>
              <DataIcon value={'＋'} kind="reward" />
              {' Add reward'}
            </>
          </Button>
        </div>
      )}

      {rewards.length === 0 ? (
        <div className="shop-empty">
          <div className="shop-empty-emo">
            <DataIcon value={'🎁'} kind="reward" />
          </div>
          <div className="shop-empty-h">No rewards yet</div>
          <div className="shop-empty-b">
            {canManage
              ? 'Add something the kids can save up for — movie night, extra screen time, a trip to the park.'
              : 'Once a parent adds rewards, they’ll show up here to save toward.'}
          </div>
          {canManage && !viewOnly && (
            <Button variant="default" type="button" onClick={() => setAdding(true)}>
              <>
                <DataIcon value={'＋'} kind="reward" />
                {' Add a reward'}
              </>
            </Button>
          )}
        </div>
      ) : (
        <div className="shop-grid">
          {shown.map((r) => {
            const cat = catOf(r.category)
            const cur = curOf(r.currency)
            const bal = activeKid ? balanceOf(activeKid.personId, r.currency) : 0
            const affordable = bal >= r.cost
            const need = Math.max(0, r.cost - bal)
            const pct = r.cost > 0 ? Math.min(100, Math.round((bal / r.cost) * 100)) : 100
            return (
              <div key={r.id} className={`shop-tile ${affordable ? '' : 'locked'}`}>
                <div
                  className="shop-thumb"
                  style={affordable ? { background: cat?.grad ?? DEFAULT_GRAD } : undefined}
                >
                  <span className="shop-thumb-emo">
                    <DataIcon value={r.emoji ?? '🎁'} kind="reward" />
                  </span>
                  {!affordable && (
                    <span className="shop-lock" aria-hidden>
                      <DataIcon value={'🔒'} kind="reward" />
                    </span>
                  )}
                  <span className="shop-price">
                    <IconValue value={cur?.symbol ?? '★'} /> {r.cost}
                  </span>
                  {canManage && (
                    <Button
                      variant="unstyled"
                      type="button"
                      className="shop-edit"
                      title="Edit reward"
                      aria-label={`Edit ${r.title}`}
                      onClick={() => setEditing(r)}
                    >
                      <DataIcon value={'✎'} kind="reward" />
                    </Button>
                  )}
                </div>
                <div className="shop-tile-body">
                  <div className="shop-tile-name">{r.title}</div>
                  {cat && <div className="shop-tile-tag">{cat.label}</div>}
                  {affordable && canRedeemActive ? (
                    <Button
                      variant="default"
                      type="button"
                      className="shop-get"
                      disabled={!activeKid || busy === r.id}
                      onClick={() => setRedeemFor(r)}
                    >
                      <>
                        <DataIcon value={'★'} kind="reward" />
                        {' Get it'}
                      </>
                    </Button>
                  ) : affordable ? (
                    <div className="shop-locked-foot">
                      <div className="shop-need">
                        Ask a parent to redeem for {(activeKid?.name ?? '').split(' ')[0]}
                      </div>
                    </div>
                  ) : (
                    <div className="shop-locked-foot">
                      <div className="shop-progress sm">
                        <div className="shop-progress-fill coral" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="shop-need">{need} more to unlock</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* archived rewards — managers only, collapsed */}
      {canManage && archived.length > 0 && (
        <div className="shop-archived">
          <Button
            variant="unstyled"
            type="button"
            className="shop-arch-head"
            onClick={() => setShowArchived((v) => !v)}
          >
            <span className={`shop-arch-caret ${showArchived ? 'open' : ''}`}>
              <DataIcon value={'›'} kind="reward" />
            </span>
            Archived ({archived.length})
          </Button>
          {showArchived && (
            <div className="shop-arch-list">
              {archived.map((r) => (
                <div key={r.id} className="shop-arch-row">
                  <span className="shop-arch-emo">
                    <DataIcon value={r.emoji ?? '🎁'} kind="reward" />
                  </span>
                  <span className="shop-arch-t">{r.title}</span>
                  <span className="shop-arch-cost">
                    <IconValue value={curOf(r.currency)?.symbol ?? '⭐'} /> {r.cost}
                  </span>
                  <Button
                    variant="ghost"
                    type="button"
                    className="shop-sm"
                    disabled={busy === r.id}
                    onClick={() => restore(r.id)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* redeem-confirm sheet */}
      {redeemFor && activeKid && (
        <RedeemSheet
          reward={redeemFor}
          currency={curOf(redeemFor.currency)}
          balance={balanceOf(activeKid.personId, redeemFor.currency)}
          busy={busy === redeemFor.id}
          onCancel={() => setRedeemFor(null)}
          onConfirm={() => redeem(redeemFor)}
        />
      )}

      {/* celebration */}
      {celebrate && activeKid && (
        <Celebration
          reward={celebrate.reward}
          pending={celebrate.pending}
          currency={curOf(celebrate.reward.currency)}
          balance={balanceOf(activeKid.personId, celebrate.reward.currency)}
          onClose={() => setCelebrate(null)}
        />
      )}

      {/* parent spot-award (user picker) */}
      {awarding && (
        <SpotAwardModal
          people={kids.map((k) => ({
            id: k.personId,
            name: k.name ?? 'Someone',
            avatarEmoji: k.avatarEmoji,
            colorHex: k.colorHex,
          }))}
          currencies={currencies}
          onClose={() => setAwarding(false)}
          onAwarded={refetch}
        />
      )}

      {(adding || editing) && (
        <RewardModal
          reward={editing ?? undefined}
          currencies={currencies}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={afterCatalogChange}
        />
      )}
    </div>
  )
}

// The redeem-confirm sheet: a centered modal with a big gradient well, the price,
// a "balance → left" line, and Not yet / Redeem it! actions.
function RedeemSheet({
  reward,
  currency,
  balance,
  busy,
  onCancel,
  onConfirm,
}: {
  reward: Reward
  currency: Currency | undefined
  balance: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cat = catOf(reward.category)
  const sym = currency?.symbol ?? '★'
  const left = balance - reward.cost
  return (
    <Modal className="modal-overlay" onClose={onCancel}>
      <div className="modal-card shop-sheet" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="unstyled"
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onCancel}
        >
          <DataIcon value={'×'} kind="reward" />
        </Button>
        <div className="shop-well" style={{ background: cat?.grad ?? DEFAULT_GRAD }}>
          <span>
            <DataIcon value={reward.emoji ?? '🎁'} kind="reward" />
          </span>
        </div>
        <div className="shop-sheet-title wf-serif">Redeem {reward.title}?</div>
        <div className="shop-sheet-price">
          <IconValue value={sym} /> {reward.cost}
        </div>
        <div className="shop-sheet-bal">
          <IconValue value={sym} /> {balance}
          <>
            {' '}
            <DataIcon value={'→'} kind="reward" />{' '}
          </>
          <IconValue value={sym} /> {left} left
        </div>
        <div className="shop-sheet-actions">
          <Button variant="ghost" type="button" onClick={onCancel}>
            Not yet
          </Button>
          <Button variant="default" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? (
              'Redeeming…'
            ) : (
              <>
                {'Redeem it! '}
                {<IconValue value={sym} />}
                {reward.cost}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const CONFETTI_COLORS = ['#EC6049', '#8A5CF0', '#F3A93B', '#25A368', '#2F7FED', '#E0548B']

// The celebration card after a successful redeem: thumb + emoji, a CSS confetti
// burst (pure CSS/JS — no library), the balance line, an approval-aware pill, and
// a "Back to shop" button. When the reward needs approval it's still *pending*, so
// the copy softens and the balance shows the pending cost.
function Celebration({
  reward,
  pending,
  currency,
  balance,
  onClose,
}: {
  reward: Reward
  pending: boolean
  currency: Currency | undefined
  balance: number
  onClose: () => void
}) {
  const cat = catOf(reward.category)
  const sym = currency?.symbol ?? '★'
  // If it needs approval no debit landed yet — show what it *will* cost. Otherwise
  // the balance already reflects the spend.
  const left = balance - reward.cost
  const confetti = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: `${Math.round((i * 37 + 11) % 100)}%`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: `${(i % 6) * 40}ms`,
        dx: `${((i % 5) - 2) * 30}px`,
        rot: `${(i * 47) % 360}deg`,
      })),
    [],
  )
  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card shop-celebrate" onClick={(e) => e.stopPropagation()}>
        <div className="shop-confetti" aria-hidden>
          {confetti.map((c, i) => (
            <span
              key={i}
              className="shop-confetti-bit"
              style={
                {
                  left: c.left,
                  background: c.color,
                  animationDelay: c.delay,
                  '--dx': c.dx,
                  '--rot': c.rot,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className="shop-well" style={{ background: cat?.grad ?? DEFAULT_GRAD }}>
          <span>
            <DataIcon value={reward.emoji ?? '🎁'} kind="reward" />
          </span>
        </div>
        <div className="shop-celebrate-title wf-serif">
          {reward.title}
          <>
            {' unlocked! '}
            <DataIcon value={'🎉'} kind="reward" />
          </>
        </div>
        <div className="shop-sheet-bal">
          {pending ? (
            <>
              <IconValue value={sym} /> {balance}
              <>
                {' '}
                <DataIcon value={'→'} kind="reward" />{' '}
              </>
              <IconValue value={sym} /> {balance - reward.cost}
              {' when approved'}
            </>
          ) : (
            <>
              <IconValue value={sym} /> {balance}
              <>
                {' '}
                <DataIcon value={'→'} kind="reward" />{' '}
              </>
              <IconValue value={sym} /> {left}
              {' left'}
            </>
          )}
        </div>
        <div className="shop-celebrate-pill">
          {pending ? (
            <>
              <DataIcon value={'✓'} kind="reward" />
              {' Asked Mom & Dad — coming soon!'}
            </>
          ) : (
            <>
              <DataIcon value={'✓'} kind="reward" />
              {' Enjoy!'}
            </>
          )}
        </div>
        <Button variant="default" type="button" className="shop-back" onClick={onClose}>
          Back to shop
        </Button>
      </div>
    </Modal>
  )
}

function RewardModal({
  reward,
  currencies,
  onClose,
  onSaved,
}: {
  reward?: Reward
  currencies: Currency[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!reward
  const spendable = currencies.filter((c) => c.spendable)
  const [title, setTitle] = useState(reward?.title ?? '')
  const [emoji, setEmoji] = useState(reward?.emoji ?? '🎁')
  const [cost, setCost] = useState(reward?.cost ?? 10)
  const [currencyKey, setCurrencyKey] = useState(
    () => reward?.currency ?? (spendable.find((c) => c.isDefault) ?? spendable[0])?.key ?? 'stars',
  )
  const [category, setCategory] = useState<string>(reward?.category ?? '')
  const [requiresApproval, setRequiresApproval] = useState(reward?.requiresApproval ?? true)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const selected = currencies.find((c) => c.key === currencyKey)

  // New rewards inherit the household default (Settings → Chores & rewards); edits keep
  // the reward's own value.
  useEffect(() => {
    if (editing) return
    let alive = true
    rewardsApi
      .settings()
      .then((s) => alive && setRequiresApproval(s.requireApproval))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [editing])

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const body = {
        title: title.trim(),
        emoji: emoji.trim() || null,
        cost: Math.max(0, Math.round(cost || 0)),
        currency: currencyKey,
        category: category || null,
        requiresApproval,
      }
      if (editing) await rewardsApi.updateReward(reward!.id, body)
      else await rewardsApi.createReward(body)
      onSaved()
      onClose()
    } catch {
      setSaving(false)
    }
  }
  async function del() {
    if (!reward) return
    if (!confirmDel) {
      setConfirmDel(true)
      return
    }
    setSaving(true)
    try {
      await rewardsApi.deleteReward(reward.id)
      onSaved()
      onClose()
    } catch {
      setSaving(false)
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
          <DataIcon value={'×'} kind="reward" />
        </Button>
        <div className="wf-serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>
          {editing ? 'Edit reward' : 'Add a reward'}
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <IconPicker
            kind="reward"
            className="rw-emoji-in"
            value={emoji}
            onValueChange={(e) => setEmoji(e)}
            aria-label="Icon"
          />
          <Input
            className="rw-title-in"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Movie night, 30 min screen time…"
            aria-label="Reward title"
            autoFocus
          />
        </div>
        {/* category picker — shared chip styling; None clears it */}
        <div className="field" style={{ marginBottom: 12 }}>
          <span>Category</span>
          <div className="shop-cat-pick" role="radiogroup" aria-label="Category">
            <Button
              variant="unstyled"
              type="button"
              role="radio"
              aria-checked={category === ''}
              className={`shop-cat ${category === '' ? 'on' : ''}`}
              onClick={() => setCategory('')}
            >
              None
            </Button>
            {SHOP_CATEGORIES.map((c) => (
              <Button
                variant="unstyled"
                key={c.key}
                type="button"
                role="radio"
                aria-checked={category === c.key}
                className={`shop-cat ${category === c.key ? 'on' : ''}`}
                onClick={() => setCategory(c.key)}
              >
                <span aria-hidden>
                  <DataIcon value={c.emoji} kind="reward" />
                </span>{' '}
                {c.label}
              </Button>
            ))}
          </div>
        </div>
        {/* currency picker — only when the family has more than one spendable currency */}
        {spendable.length > 1 && (
          <div className="rw-cur-pick">
            {spendable.map((c) => (
              <Button
                variant="unstyled"
                key={c.key}
                type="button"
                className={`rw-cur-chip ${c.key === currencyKey ? 'on' : ''}`}
                style={
                  c.key === currencyKey && c.color
                    ? { borderColor: c.color, color: c.color, background: `${c.color}18` }
                    : undefined
                }
                onClick={() => setCurrencyKey(c.key)}
              >
                <IconValue value={c.symbol ?? '⭐'} /> {c.label}
              </Button>
            ))}
          </div>
        )}
        <Label className="rw-cost-field">
          <span>Cost</span>
          <div className="rw-cost-input">
            <span className="rw-cost-sym">
              <IconValue value={selected?.symbol ?? '⭐'} />
            </span>
            <Input
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
              aria-label="Cost"
            />
          </div>
        </Label>
        <Label className="rw-cost-field" style={{ marginTop: 12 }}>
          <span>
            Needs a parent’s OK
            <span className="tiny muted" style={{ display: 'block', fontWeight: 600 }}>
              {requiresApproval
                ? 'Redeeming waits for approval.'
                : 'Redeems instantly if affordable.'}
            </span>
          </span>
          <Checkbox
            className="set-check"
            checked={requiresApproval}
            onCheckedChange={(e) => setRequiresApproval(e === true)}
            aria-label="Needs a parent's OK"
          />
        </Label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
          {editing && (
            <Button
              variant="unstyled"
              type="button"
              onClick={del}
              disabled={saving}
              title="Archived rewards keep their redemption history and can be restored"
              style={{
                border: 0,
                background: 'none',
                font: 'inherit',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--primary)',
                cursor: 'pointer',
                padding: '8px 4px',
              }}
            >
              {confirmDel ? 'Tap again to archive' : 'Archive'}
            </Button>
          )}
          <Button
            variant="ghost"
            type="button"
            className="shop-sm"
            style={{ marginLeft: 'auto' }}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            type="button"
            className="shop-sm"
            disabled={saving || !title.trim()}
            onClick={save}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Add reward'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
