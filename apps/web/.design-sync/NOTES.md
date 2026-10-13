# design-sync notes — Waffled (`apps/web`)

Run every converter command from `apps/web/` (the config home is `apps/web/.design-sync/`).

## How this repo maps onto the converter
- Shape `package`, no Storybook. `apps/web` is a Vite app, not a library: there is no
  `dist/`. `.design-sync/entry.ts` is a curated entry that re-exports the data-free
  components from `src/` and imports EVERY `src/styles/*.css` (app order, `kitchen.css`
  last). Route screens lazy-load most stylesheets in the app; shipping them all is what
  gives the design agent the full class vocabulary.
- `componentSrcMap` enumerates the components on purpose. No `.d.ts` tree exists, so
  it is the component list. Add a component = add it to `entry.ts` AND `componentSrcMap`.
- Keep anything that imports `lib/api` values, `lib/powersync`, or `cal-utils` OUT.
  `DayPicker` was dropped: `cal-utils -> events-local -> powersync/db` dragged
  @powersync/web + wa-sqlite in (1.4 MB bundle). `OfflineBanner` was dropped too:
  `lib/pwa` uses `import.meta.env`, and the IIFE bundle can't use it.
  Type-only `lib/api` imports are fine (MealCard, RhythmMark).
- `WaffledRoot` (`.design-sync/general/WaffledRoot.tsx`) is sync-owned, not app code.
  It renders `.wf` and stamps `data-palette`/`data-theme` on `<html>` the way
  `lib/theme.ts` does. It lives in a dir literally named `general` so the
  converter's src-path group stays generic and the `docsMap` category stub applies.
- Groups come from `docsMap` -> `.design-sync/groups/<Group>.md` category stubs.
  `srcDir: src/kiosk` makes `components/` the (generic) path segment. Without it,
  every card lands in a `kiosk` group.
- Fonts come from `@fontsource` CSS via `extraFonts` (Atkinson 400/700, Bricolage variable, plus
  the typeface sets: Lexend, Atkinson Hyperlegible Next, Nunito variable, Andika 400/700).

## Preview gotchas
- `.modal-overlay` is `position: fixed`. Overlay previews wrap it in a
  `transform: translateZ(0)` box (see `previews/ConfirmDialog.tsx`) so it renders inside the cell.
- `<Icon>` has no intrinsic size. Previews place it inside `btn`/`pill`/`icon-btn`/`rail-item`.
- Interactive components (`ChipEditor`, `ColorPicker`, `MultiSelect`, `WeekdayChips`,
  `AlbumPicker`, `MealBuilderBar`) use `useState` wrappers in their previews.
  MultiSelect's open menu is internal state and isn't previewed.

## Known render warns (triaged)
- `[TOKENS_MISSING] --lanes --span-row --span-col --span-len --lane --wk-min`: set
  inline by calendar code at runtime. Expected.
- `[TOKENS_MISSING] --ink2`: a real typo in `src/styles/recipe.css` (should be
  `--ink-2`). That is an app bug, not a sync issue.
- `[FONT_MISSING] "Bricolage Grotesque"`: only the fallback name after
  `"Bricolage Grotesque Variable"`, which does ship.

## Findings for the app
- `apps/web/CLAUDE.md` mentions a `.set-tray` class that no stylesheet defines.

## Re-sync risks
- `entry.ts` + `componentSrcMap` are hand-curated. New presentational components
  are NOT picked up automatically.
- A component that starts importing runtime `lib/api`/`powersync` code silently
  balloons the bundle. Watch the `bundle:` size line (~32 KB today).
- New `src/styles/*.css` files must be added to `entry.ts`.
- Playwright: the repo pins 1.61.1 (chromium-1228, not cached here). The sync used
  `playwright@1.60.0` in `.ds-sync/` to match the cached chromium-1223.
