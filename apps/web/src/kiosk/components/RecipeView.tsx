import { useEffect, useRef, useState } from 'react'
import { Editable } from '../../lib/viewOnly'
import { useNavigate } from 'react-router'
import {
  mealBuilderApi,
  mealsApi,
  pantryApi,
  useRecipe,
  useRecordRecipeView,
  type RecipeIngredient,
  type RecipeMatch,
  type RecipeOverrides,
  type RecipeStep,
} from '../../lib/api'
import { ScheduleModal } from './ScheduleModal'
import { RecipeGroceryModal } from './RecipeGroceryModal'
import { CookConfirm } from './CookConfirm'
import { useTopbarFull } from '../topbar-slot'
import { fmtAmt } from '../../lib/amount'
import '../../styles/recipe.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DataIcon } from '@/components/ui/data-icon'
import {
  Heart,
  ShoppingCart,
  Pencil,
  CalendarDays,
  Share,
  Clock,
  Check,
  Sparkles,
} from 'lucide-react'
import { Card } from '@/components/ui/card'

// Favorite / edit / schedule as icon buttons. Rendered in the topbar (full-screen
// route, on the back-button row) and inline (modal preview, which has no topbar).
function RecipeActionIcons({
  fav,
  onFav,
  onEdit,
  onSchedule,
  onAddToGrocery,
  onShare,
}: {
  fav: boolean
  onFav: () => void
  onEdit: () => void
  onSchedule: () => void
  onAddToGrocery: () => void
  onShare: () => void
}) {
  return (
    <>
      <Button
        variant="unstyled"
        type="button"
        className={`icon-btn rd-fav ${fav ? 'on' : ''}`}
        aria-label="Favorite"
        aria-pressed={fav}
        onClick={onFav}
      >
        <Heart aria-hidden="true" />
      </Button>
      <Button
        variant="unstyled"
        type="button"
        className="icon-btn"
        aria-label="Add to grocery"
        onClick={onAddToGrocery}
      >
        <ShoppingCart aria-hidden="true" />
      </Button>
      <Editable>
        <Button
          variant="unstyled"
          type="button"
          className="icon-btn"
          aria-label="Edit recipe"
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
        </Button>
      </Editable>
      <Button
        variant="unstyled"
        type="button"
        className="icon-btn"
        aria-label="Schedule"
        onClick={onSchedule}
      >
        <CalendarDays aria-hidden="true" />
      </Button>
      <Button
        variant="unstyled"
        type="button"
        className="icon-btn"
        aria-label="Share recipe"
        onClick={onShare}
      >
        <Share aria-hidden="true" />
      </Button>
    </>
  )
}

// Trigger a client-side download of the compiled markdown as a .md file (fallback for
// browsers without navigator.share, e.g. desktop).
function downloadMarkdown(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The one canonical recipe view — hero, metadata chips, scalable ingredients with
// substitutions, the method (per-step ingredients + notes), on-hand banner, and
// "your notes". Self-contained by id so it renders identically whether it's the
// full-screen route (RecipeDetail) or a modal preview (RecipeModal).

function IngredientRow({
  ing,
  ratio,
  onSub,
}: {
  ing: RecipeIngredient
  ratio: number
  onSub: (val: string) => void
}) {
  const [checked, setChecked] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const left =
    ing.amount != null ? `${fmtAmt(ing.amount * ratio)}${ing.unit ? ` ${ing.unit}` : ''}` : '—'
  const origName = ing.prepNote ? `${ing.name}, ${ing.prepNote}` : ing.name

  if (editing) {
    return (
      <div className="ring-row editing">
        <span className="ring-amt">{left}</span>
        <Input
          className="ring-sub-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`use instead of ${ing.name}…`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSub(draft)
              setEditing(false)
            }
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <Button
          variant="unstyled"
          type="button"
          className="ring-sub-ok"
          onClick={() => {
            onSub(draft)
            setEditing(false)
          }}
        >
          Save
        </Button>
        {ing.sub && (
          <Button
            variant="unstyled"
            type="button"
            className="ring-sub-clear"
            onClick={() => {
              onSub('')
              setEditing(false)
            }}
          >
            Reset
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className={`ring-row checklist ${checked ? 'on' : ''} ${ing.sub ? 'subbed' : ''}`}>
      <span
        className="ring-ck"
        aria-hidden
        role="button"
        tabIndex={0}
        onClick={() => setChecked((v) => !v)}
      >
        {checked ? <DataIcon value={'✓'} kind="meal" /> : ''}
      </span>
      <span className="ring-amt" onClick={() => setChecked((v) => !v)}>
        {left}
      </span>
      <span className="ring-name" onClick={() => setChecked((v) => !v)}>
        {ing.sub ? ing.sub : origName}
        {ing.sub && (
          <span className="ring-was">
            <>
              <DataIcon value={'↺'} kind="meal" />
              {' instead of '}
            </>
            {ing.name}
          </span>
        )}
      </span>
      <Button
        variant="unstyled"
        type="button"
        className="ring-sub-btn"
        aria-label="Substitute"
        onClick={() => {
          setDraft(ing.sub ?? '')
          setEditing(true)
        }}
      >
        <DataIcon value={'⇄'} kind="meal" />
      </Button>
    </div>
  )
}

function StepRow({ s, onNote }: { s: RecipeStep; onNote: (val: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const timer =
    s.timerSeconds != null && s.timerSeconds > 0
      ? `${Math.floor(s.timerSeconds / 60)}:${String(s.timerSeconds % 60).padStart(2, '0')}`
      : null
  return (
    <div className="rd-step">
      <div className="rd-step-n">{s.stepNumber}</div>
      <div className="rd-step-body">
        <div className="rd-step-t">{s.instruction}</div>
        {/* Ingredients referenced in one quiet line, not a wall of chips; timer as a small inline clock. */}
        {(s.ingredients.length > 0 || timer) && (
          <div className="rd-step-meta">
            {s.ingredients.length > 0 && (
              <span className="rd-uses">
                <b>Uses:</b> {s.ingredients.join(', ')}
              </span>
            )}
            {timer && (
              <span className="rd-timer" aria-label={`timer ${timer}`}>
                <Clock aria-hidden="true" />
                {timer}
              </span>
            )}
          </div>
        )}
        {s.note && !editing && (
          <div className="rd-step-note">
            <>
              <DataIcon value={'📝'} kind="meal" />{' '}
            </>
            {s.note}
          </div>
        )}
        {editing ? (
          <div className="rd-step-noteedit">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="add a note for this step…"
            />
            <div className="rd-step-noteactions">
              <Button
                variant="unstyled"
                type="button"
                className="pill btn-primary"
                style={{ color: 'var(--on-accent)', border: 0 }}
                onClick={() => {
                  onNote(draft)
                  setEditing(false)
                }}
              >
                Save
              </Button>
              {s.note && (
                <Button
                  variant="unstyled"
                  type="button"
                  className="pill btn-primary"
                  onClick={() => {
                    onNote('')
                    setEditing(false)
                  }}
                >
                  Remove
                </Button>
              )}
              <Button
                variant="unstyled"
                type="button"
                className="pill btn-primary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="unstyled"
            type="button"
            className="rd-step-addnote"
            onClick={() => {
              setDraft(s.note ?? '')
              setEditing(true)
            }}
          >
            {s.note ? 'Edit note' : '+ Add note'}
          </Button>
        )}
      </div>
    </div>
  )
}

export function RecipeView({
  id,
  onSelect,
  selectLabel,
  fullScreen,
}: {
  id: string
  onSelect?: () => void
  selectLabel?: string
  fullScreen?: boolean
}) {
  const navigate = useNavigate()
  // onHand/toBuy default here so a caller (or a test) that stubs useRecipe without
  // them can't turn an absent count into a crash — absent means "no claim", same as null.
  const {
    recipe,
    ingredients,
    steps,
    onHand = null,
    toBuy = 0,
    toBuyNames = [],
    loading,
    error,
    refetch,
  } = useRecipe(id)
  // Records the visit for the Recently-viewed rail — on the SCREEN, not in useRecipe
  // (the editor and Cook Mode fetch through that hook too).
  useRecordRecipeView(id)
  const [servings, setServings] = useState<number | null>(null)
  const [showAllTags, setShowAllTags] = useState(false)
  const [fav, setFav] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [addedNote, setAddedNote] = useState<string | null>(null)
  const [pickingGrocery, setPickingGrocery] = useState(false)
  const [cooked, setCooked] = useState(0)
  const [notes, setNotes] = useState('')
  const [usedMatches, setUsedMatches] = useState<RecipeMatch[] | null>(null)
  const [building, setBuilding] = useState(false)
  // The to-buy list starts closed: the banner sits directly above Method, so opening
  // it by default would push the steps down on every recipe you look at.
  const [showToBuy, setShowToBuy] = useState(false)
  // Real, pantry-derived shopping numbers for the banner, carried by useRecipe off the
  // same GET /api/recipes/:id the screen already makes. `onHand` is null whenever we
  // can't make the claim — the pantry module is off — and the banner then says nothing
  // about what's on hand. It must never fall back to counting `isStaple` ingredients
  // (the old bug: an empty pantry still read "4 of 9 on hand") and never render
  // "0 of N", which is a different untruth.
  // Compiled shareable markdown, prefetched on load. Native navigator.share() needs the
  // click handler to stay inside the user-gesture (transient activation) — awaiting a
  // fetch inside the handler breaks that on Safari — so we prefetch and share the
  // already-loaded text synchronously. A ref (not state) so the full-screen topbar's
  // memoized handler always reads the latest value; refreshed when the recipe changes.
  const shareMd = useRef<{ markdown: string; filename: string } | null>(null)

  useEffect(() => {
    if (recipe) {
      setFav(recipe.isFavorite)
      setCooked(recipe.cookedCount)
      setNotes(recipe.userNotes ?? '')
      shareMd.current = null
      mealsApi
        .recipeMarkdown(recipe.id)
        .then((r) => {
          shareMd.current = r
        })
        .catch(() => {})
    }
  }, [recipe])

  function toggleFav() {
    const next = !fav
    setFav(next)
    if (recipe) mealsApi.updateRecipe(recipe.id, { isFavorite: next }).catch(() => setFav(!next))
  }

  async function patchOverrides(mutate: (ov: RecipeOverrides) => RecipeOverrides) {
    if (!recipe) return
    try {
      await mealsApi.updateRecipe(recipe.id, { overrides: mutate(recipe.overrides ?? {}) })
      refetch()
    } catch {
      /* ignore */
    }
  }
  function setSub(name: string, value: string) {
    patchOverrides((ov) => {
      const subs = { ...(ov.subs ?? {}) }
      const k = name.trim().toLowerCase()
      if (value.trim()) subs[k] = value.trim()
      else delete subs[k]
      const next = { ...ov }
      if (Object.keys(subs).length) next.subs = subs
      else delete next.subs
      return next
    })
  }
  function setStepNote(n: number, value: string) {
    patchOverrides((ov) => {
      const sn = { ...(ov.stepNotes ?? {}) }
      if (value.trim()) sn[String(n)] = value.trim()
      else delete sn[String(n)]
      const next = { ...ov }
      if (Object.keys(sn).length) next.stepNotes = sn
      else delete next.stepNotes
      return next
    })
  }
  function saveNotes() {
    if (recipe && notes.trim() !== (recipe.userNotes ?? ''))
      mealsApi.updateRecipe(recipe.id, { userNotes: notes }).catch(() => {})
  }
  function markCooked() {
    if (!recipe) return
    setCooked((c) => c + 1)
    setAddedNote('Marked as cooked — nice work.')
    mealsApi.markCooked(recipe.id).catch(() => setCooked((c) => Math.max(0, c - 1)))
    // Offer to update the pantry with what this recipe likely used (skipped silently
    // when the pantry module is off or nothing on hand matched).
    pantryApi
      .forRecipe(recipe.id)
      .then((m) => {
        if (m.length) setUsedMatches(m)
      })
      .catch(() => {})
  }
  const enc = encodeURIComponent
  const chip = (params: string) => navigate(`/meals/recipes?${params}`)

  // Full-screen route: the back button and the icon actions share one topbar row
  // (the modal renders them inline instead — it has no topbar). Re-runs on fav so
  // the heart fills/empties, and on load so the actions appear once the recipe is in.
  useTopbarFull(
    () =>
      fullScreen ? (
        <>
          <Button
            variant="unstyled"
            type="button"
            className="pill btn-primary"
            onClick={() => navigate(-1)}
          >
            <>
              <DataIcon value={'‹'} kind="meal" />
              {' Recipes'}
            </>
          </Button>
          {recipe && (
            <div className="rd-topbar-actions">
              <RecipeActionIcons
                fav={fav}
                onFav={toggleFav}
                onEdit={() => navigate(`/meals/recipe/${recipe.id}/edit`)}
                onSchedule={() => setScheduling(true)}
                onAddToGrocery={addToGrocery}
                onShare={shareRecipe}
              />
            </div>
          )}
        </>
      ) : null,
    [fullScreen, fav, recipe?.id],
  )

  if (loading)
    return (
      <div className="muted" style={{ padding: 30 }}>
        Loading…
      </div>
    )
  if (error || !recipe)
    return (
      <div className="muted" style={{ padding: 30 }}>
        This recipe isn’t available.
      </div>
    )

  const base = recipe.servings || 4
  const current = servings ?? base
  const ratio = current / base
  // `toBuyNames` is server-derived and always agrees with `toBuy` — including with the
  // pantry ON, where the count is the *unmatched* subset and no client-side guess from
  // `ingredients` could have been right. Empty ⇒ nothing to open into, so the count
  // stays plain text rather than becoming a control that expands to nothing.
  const canExpand = toBuyNames.length > 0

  // Opens the picker so the shopper can add all or choose specific ingredients
  // (they may already have some on hand). The actual add happens in the modal.
  function addToGrocery() {
    setPickingGrocery(true)
  }
  function onGroceryAdded(added: number) {
    if (added < 0) setAddedNote('Couldn’t reach the grocery list — try again.')
    else
      setAddedNote(
        added > 0
          ? `Added ${added} item${added === 1 ? '' : 's'} to this week’s grocery list.`
          : 'Everything’s already on the list — nothing to add.',
      )
  }

  // "Build a meal around this" — start a plate seeded from this recipe: named after
  // it, carrying its servings, and with the recipe already on the plate in its
  // natural role (a dessert comes in as the dessert, everything else as the main).
  // The builder doubles as meal detail on web, so we go straight there.
  async function buildMeal() {
    if (building) return
    setBuilding(true)
    try {
      const r = recipe!
      const cat = (r.category ?? r.mealType ?? '').toLowerCase()
      const meal = await mealBuilderApi.create({ name: r.title, servings: r.servings || 4 })
      await mealBuilderApi.addDish(meal.id, {
        recipeId: r.id,
        role: cat === 'dessert' ? 'dessert' : 'main',
      })
      navigate(`/meals/build/${meal.id}`)
    } catch {
      setAddedNote('Couldn’t start a meal from this recipe — try again.')
    } finally {
      setBuilding(false)
    }
  }

  async function shareRecipe() {
    // Prefer the prefetched markdown so navigator.share() fires inside the click gesture
    // (Safari requires transient activation). Only fetch here if the prefetch hasn't
    // landed yet — that path can't use the native sheet, so it falls back to copy+download.
    const payload = shareMd.current ?? (await mealsApi.recipeMarkdown(recipe!.id).catch(() => null))
    if (!payload) {
      setAddedNote('Couldn’t prepare the recipe to share — try again.')
      return
    }
    const { markdown, filename } = payload
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean }
    try {
      const file = new File([markdown], filename, { type: 'text/markdown' })
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ title: recipe!.title, files: [file] } as ShareData)
        return
      }
      if (nav.share) {
        await nav.share({ title: recipe!.title, text: markdown })
        return
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return // user dismissed the sheet
      // any other share failure → fall through to the copy + download fallback
    }
    try {
      await navigator.clipboard?.writeText(markdown)
      setAddedNote('Recipe copied to clipboard.')
    } catch {
      /* non-secure context (Safari over http) — the download still lands the recipe */
    }
    downloadMarkdown(markdown, filename)
  }

  // Categorical chips are what people scan — show the first few, tuck the rest behind
  // a "+N more" toggle. Free-form #hashtags drop to a quiet muted line (they're for
  // search, not scanning).
  const chipTags: Array<{
    key: string
    label: string
    icon?: string
    cls?: string
    params: string
  }> = []
  if (fav)
    chipTags.push({ key: 'fav', icon: '❤️', label: 'Favorites', cls: 'fav', params: 'fav=1' })
  if (cooked === 0)
    chipTags.push({ key: 'new', icon: '🆕', label: 'New', cls: 'new', params: 'new=1' })
  if (recipe.collection)
    chipTags.push({
      key: 'coll',
      icon: '📁',
      label: recipe.collection,
      cls: 'coll',
      params: `collection=${enc(recipe.collection)}`,
    })
  if (recipe.cuisine)
    chipTags.push({
      key: 'cuisine',
      icon: '🌍',
      label: recipe.cuisine,
      params: `cuisine=${enc(recipe.cuisine)}`,
    })
  if (recipe.mealType)
    chipTags.push({
      key: 'meal',
      label: recipe.mealType.replace('-', ' '),
      params: `q=${enc(recipe.mealType)}`,
    })
  if (recipe.protein)
    chipTags.push({
      key: 'protein',
      icon: '🥩',
      label: recipe.protein,
      params: `protein=${enc(recipe.protein)}`,
    })
  if (recipe.base)
    chipTags.push({ key: 'base', icon: '🍚', label: recipe.base, params: `q=${enc(recipe.base)}` })
  if (recipe.cookMethod)
    chipTags.push({
      key: 'method',
      icon: '🍳',
      label: recipe.cookMethod,
      params: `q=${enc(recipe.cookMethod)}`,
    })
  if (recipe.effort)
    chipTags.push({
      key: 'effort',
      icon: '⏱️',
      label: recipe.effort,
      params: `q=${enc(recipe.effort)}`,
    })
  for (const d of recipe.dietary)
    chipTags.push({ key: `d-${d}`, label: d, cls: 'diet', params: `diet=${enc(d)}` })
  for (const v of recipe.vegetables)
    chipTags.push({ key: `v-${v}`, icon: '🥬', label: v, cls: 'veg', params: `q=${enc(v)}` })
  const VISIBLE_TAGS = 3
  const shownTags = showAllTags ? chipTags : chipTags.slice(0, VISIBLE_TAGS)
  const hiddenCount = chipTags.length - shownTags.length
  const hashtags = [
    ...recipe.addedTags,
    ...(recipe.tags ?? []).filter((t) => !recipe.addedTags.includes(t)),
  ]

  return (
    <div className="recipe-view">
      {/* Modal preview has no topbar, so the actions render inline here; the
          full-screen route puts them on the back-button row (see useTopbarFull). */}
      {!fullScreen && (
        <div className="rd-actions">
          {onSelect && (
            <Button variant="default" type="button" className="rd-select" onClick={onSelect}>
              {selectLabel ?? 'Select'}
            </Button>
          )}
          <RecipeActionIcons
            fav={fav}
            onFav={toggleFav}
            onEdit={() => navigate(`/meals/recipe/${recipe.id}/edit`)}
            onSchedule={() => setScheduling(true)}
            onAddToGrocery={addToGrocery}
            onShare={shareRecipe}
          />
        </div>
      )}

      <div className="recipe-detail">
        {/* left: hero + meta + ingredients */}
        <div className="rd-left">
          <div className="rd-hero">
            {recipe.imageUrl ? (
              <img src={recipe.imageUrl} alt={recipe.title} />
            ) : (
              <span className="rd-hero-emoji">
                <DataIcon value={recipe.emoji ?? '🍽️'} kind="meal" />
              </span>
            )}
          </div>
          <div className="wf-serif rd-title">{recipe.title}</div>
          <div className="rd-meta">
            {recipe.cookTimeMinutes != null && (
              <span>
                <>
                  <DataIcon value={'🕐'} kind="meal" />{' '}
                </>
                {recipe.cookTimeMinutes} min
              </span>
            )}
            <span>
              <>
                <DataIcon value={'🍽️'} kind="meal" />
                {' Serves '}
              </>
              {base}
            </span>
            {steps.length > 0 && (
              <span>
                <>
                  <DataIcon value={'🪜'} kind="meal" />{' '}
                </>
                {steps.length} steps
              </span>
            )}
            {recipe.sourceName && (
              <span>
                <>
                  <DataIcon value={'📖'} kind="meal" />{' '}
                </>
                {recipe.sourceName}
              </span>
            )}
          </div>

          <div className="rd-tagrow">
            {shownTags.map((t) => (
              <Button
                variant="unstyled"
                key={t.key}
                className={`rd-tag ${t.cls ?? ''}`}
                onClick={() => chip(t.params)}
              >
                {t.icon && (
                  <>
                    <DataIcon value={t.icon} kind="meal" />{' '}
                  </>
                )}
                {t.label}
              </Button>
            ))}
            {chipTags.length > VISIBLE_TAGS && (
              <Button
                variant="unstyled"
                className="rd-tag rd-tag-more"
                onClick={() => setShowAllTags((v) => !v)}
              >
                {showAllTags ? 'Show less' : `+${hiddenCount} more`}
              </Button>
            )}
          </div>
          {hashtags.length > 0 && (
            <div className="rd-hashtags">{hashtags.map((t) => `#${t}`).join(' · ')}</div>
          )}

          {steps.length > 0 && (
            <Button
              variant="unstyled"
              type="button"
              className="rd-cookbar"
              onClick={() => navigate(`/meals/recipe/${recipe.id}/cook`)}
            >
              <span className="rd-cookbar-emoji" aria-hidden>
                <DataIcon value={'👨‍🍳'} kind="meal" />
              </span>
              Cook Mode
            </Button>
          )}

          {/* A recipe is one dish; a meal is the whole plate around it. */}
          <div style={{ display: 'flex', margin: '12px 0 2px' }}>
            <Button
              variant="default"
              type="button"
              className="rd-buildmeal"
              style={{ fontSize: 13.5, padding: '10px 18px' }}
              onClick={buildMeal}
              disabled={building}
            >
              <span aria-hidden>
                <DataIcon value={'🍽️'} kind="meal" />
              </span>
              {building ? 'Starting a meal…' : 'Build a meal around this'}
            </Button>
          </div>

          <div className="rd-status-row">
            <span className="st-lbl">
              {cooked > 0 ? (
                <>
                  <>
                    <DataIcon value={'👨‍🍳'} kind="meal" />
                    {' Cooked '}
                  </>
                  {cooked}
                  <DataIcon value={'×'} kind="meal" />
                </>
              ) : (
                'Not cooked yet'
              )}
            </span>
            <Button variant="unstyled" type="button" className="rd-markbtn" onClick={markCooked}>
              <Check
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              Mark cooked
            </Button>
          </div>

          <Card className="card rd-ings">
            <div className="rd-ings-head">
              <div className="card-h">Ingredients</div>
              <div className="rd-servings">
                <span className="tiny muted" style={{ fontWeight: 700 }}>
                  Servings
                </span>
                <Button
                  variant="unstyled"
                  type="button"
                  aria-label="Fewer"
                  onClick={() => setServings(Math.max(1, current - 1))}
                >
                  −
                </Button>
                <span className="rd-sv-n">{current}</span>
                <Button
                  variant="unstyled"
                  type="button"
                  aria-label="More"
                  onClick={() => setServings(current + 1)}
                >
                  +
                </Button>
              </div>
            </div>
            {ingredients.map((ing) => (
              <IngredientRow
                key={ing.id}
                ing={ing}
                ratio={ratio}
                onSub={(val) => setSub(ing.name, val)}
              />
            ))}
            <div className="tiny muted rd-sub-hint">
              <>
                {'Tap '}
                <DataIcon value={'⇄'} kind="meal" />
                {' to swap an ingredient — your swaps stick across re-imports.'}
              </>
            </div>
          </Card>
        </div>

        {/* right: on-hand banner + method */}
        <div className="rd-right">
          {(onHand !== null || toBuy > 0) && (
            <div className={`rd-ai${showToBuy && canExpand ? ' is-open' : ''}`}>
              <div className="rd-ai-sp">
                <Sparkles aria-hidden="true" />
              </div>
              <div className="rd-ai-tx">
                {onHand !== null && (
                  <>
                    <b>
                      {onHand.have} of {onHand.total}
                    </b>{' '}
                    {onHand.have === onHand.total
                      ? 'ingredients on hand'
                      : 'ingredients already on hand'}
                    {toBuy > 0 && ' — '}
                  </>
                )}
                {toBuy > 0 &&
                  (canExpand ? (
                    // A count you can't act on is just anxiety — open it into the names.
                    <Button
                      variant="unstyled"
                      type="button"
                      className="rd-ai-buy"
                      aria-expanded={showToBuy}
                      onClick={() => setShowToBuy((v) => !v)}
                    >
                      <b>{toBuy} to buy</b>
                      <span className="rd-ai-caret">
                        {showToBuy ? (
                          <DataIcon value={'▾'} kind="meal" />
                        ) : (
                          <DataIcon value={'▸'} kind="meal" />
                        )}
                      </span>
                    </Button>
                  ) : (
                    <>
                      <b>{toBuy} to buy</b>
                      {onHand === null && ' for this recipe'}
                    </>
                  ))}
                {showToBuy && canExpand && (
                  <ul className="rd-ai-list">
                    {toBuyNames.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
              {toBuy > 0 && (
                <Button
                  variant="unstyled"
                  type="button"
                  className="rd-ai-go"
                  onClick={addToGrocery}
                >
                  Add to grocery
                </Button>
              )}
            </div>
          )}
          {addedNote && <div className="rd-added tiny">{addedNote}</div>}

          <Card className="card rd-method">
            <div className="card-h" style={{ marginBottom: 14 }}>
              Method
            </div>
            {steps.length === 0 && (
              <div className="muted tiny" style={{ fontWeight: 600 }}>
                No steps recorded for this recipe.
              </div>
            )}
            {steps.map((s) => (
              <StepRow key={s.stepNumber} s={s} onNote={(val) => setStepNote(s.stepNumber, val)} />
            ))}

            <div className="rd-notes">
              <div className="card-h" style={{ fontSize: 16, margin: '6px 0 8px' }}>
                <>
                  <DataIcon value={'📝'} kind="meal" />
                  {' Your notes'}
                </>
              </div>
              <Textarea
                className="rd-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="e.g. doubles well · use less salt · the kids love this one. (Kept across re-imports.)"
              />
              {recipe.notes && (
                <details className="rd-srcnotes">
                  <summary>Recipe notes (from the source)</summary>
                  <div className="tiny muted" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
                    {recipe.notes}
                  </div>
                </details>
              )}
            </div>
          </Card>
        </div>
      </div>

      {scheduling && (
        <ScheduleModal
          recipe={recipe}
          onClose={() => setScheduling(false)}
          onScheduled={(label) => setAddedNote(`Scheduled for ${label}.`)}
        />
      )}
      {pickingGrocery && (
        <RecipeGroceryModal
          recipeId={recipe.id}
          title={recipe.title}
          ingredients={ingredients}
          ratio={ratio}
          onClose={() => setPickingGrocery(false)}
          onAdded={onGroceryAdded}
        />
      )}
      {usedMatches && (
        <CookConfirm
          title={recipe.title}
          matches={usedMatches}
          onClose={() => setUsedMatches(null)}
          onApplied={(n) =>
            n > 0 && setAddedNote(`Pantry updated — ${n} item${n === 1 ? '' : 's'}.`)
          }
        />
      )}
    </div>
  )
}
