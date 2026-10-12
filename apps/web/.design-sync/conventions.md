# Waffled — how to build with this design system

Waffled is a family-hub app (calendar, meals, chores, lists) shown on a wall/counter
tablet and on phones. Its design language is mostly **global CSS classes + CSS custom
properties**, plus a small set of React components on `window.Waffled`.

## 1. Always wrap in `WaffledRoot`

Every design's root must be `<WaffledRoot>`. It renders the `.wf` element that sets the
font (`var(--sans)`) and ink colour; without it, text falls back to browser-default
Times. Palette and theme are stamped on `<html>` because the CSS keys off
`:root[data-palette]` / `:root[data-theme]`:

```jsx
const { WaffledRoot } = window.Waffled
<WaffledRoot palette="kitchen" theme="light">{/* screen */}</WaffledRoot>
```

- `palette`: `"default"` (warm coral brand) or `"kitchen"` (the 10" counter-tablet
  palette: green accents, Atkinson Hyperlegible body, Bricolage Grotesque headings,
  48px touch targets). Use `kitchen` for anything meant for the kitchen tablet.
- `theme`: `"light"` | `"dark"`. `kiosk`: adds `.wf-kiosk` (full-height rail + content grid).
- Page background is `var(--bg)`; content sits on `var(--card)` surfaces.

## 2. Styling idiom: classes + tokens, never raw controls

Never ship a bare `<button>`, `<input>`, or `<select>`; use these classes.

| Need | Use |
|---|---|
| Primary / secondary button | `btn btn-primary` / `btn btn-ghost` (both classes required); `btn-ai` = gradient AI action |
| Compact chip-button | `pill`; round icon button `icon-btn`; floating add `fab` |
| Toggle switch | `<span className={"toggle " + (on ? "on" : "")} />` inside a `<label>` |
| Labelled input | `<label className="field"><span>Label</span><input/></label>`; side-by-side `field-row`; pill select `sel` |
| Surface | `card` (raised), `set-card` (settings/list row card) |
| Modal | `modal-overlay` > `modal-card` (+ `modal-close` × button). No `.modal` class exists. |
| Text | headings `wf-serif`; secondary `muted`; small `tiny`; label badge `tag` |
| Recipe card | `rc` > `rc-img g-pasta` (gradients: `g-taco g-pan g-pork g-wing g-cookie g-lentil g-salmon g-pizza g-veg`) + `rc-b` > `rc-t`, `rc-m` |

Tokens (`var(--…)`): surfaces `--bg --panel --card --card-2 --rail`; ink `--ink --ink-2
--ink-3`; lines `--hair --hair-2 --line`; brand `--primary --primary-d --primary-t`,
`--gold --gold-t --gold-d`, AI `--ai --ai-d --ai-t`; status `--success --danger --warn
--info`; text-on-colour `--on-accent`; family colours `--person-1`…`--person-4`; radii
`--r-xs --r-sm --r-md --r-lg --r-xl`; shadows `--sh-1 --sh-2 --sh-3`; scrim `--scrim`;
fonts `--sans --serif --mono`. Use tokens, never hex, so both palettes and dark mode work.

Icons: `<Icon name="…"/>` draws a bare 24×24 SVG that takes size/stroke from its context
class (`btn`, `pill`, `icon-btn`, `rail-item`), so always place it inside one of them.

## 3. Where the truth lives

Read `styles.css` and its imports (`_ds_bundle.css` holds every app stylesheet:
`waffled.css` base, `kiosk.css` modals/fields, `kitchen.css` tablet palette overrides).
Each component's `.prompt.md` has working examples, and its `.d.ts` has the props.

## 4. Example

```jsx
const { WaffledRoot, MealCard, ConfirmDialog, Icon } = window.Waffled
<WaffledRoot palette="kitchen">
  <div style={{ background: 'var(--bg)', padding: 24, display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h2 className="wf-serif" style={{ margin: 0, fontSize: 28 }}>This week's meals</h2>
      <button className="btn btn-primary"><Icon name="plus" /> Add meal</button>
    </div>
    <div className="set-card">
      <label className="field"><span>Who's cooking?</span><input placeholder="Elaine" /></label>
    </div>
  </div>
</WaffledRoot>
```
