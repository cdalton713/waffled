# Waffled web app — conventions & gotchas (`apps/web`, React/kiosk)

Folder-scoped notes; loads when working under `apps/web`. See the repo-root
`CLAUDE.md` for repo-wide workflow (worktree-first, TDD, PRs, releases).

## Web app (React/kiosk, `apps/web`)

### Design system — REUSE, don't hand-roll (this bit us — polish it once, use it everywhere)

**Two hard rules for any web UI you build:**
1. **Always match the app's visual style** — use the existing design-system classes/
   components. Never ship raw/base HTML controls (bare `<input type="number">`,
   default `<button>`, un-backdropped divs). If it looks like an unstyled browser
   default, it's wrong.
2. **Reuse the component/pattern that already exists** before writing a new one. If a
   modal/button/toggle/timer already exists, use it — don't reinvent a worse copy.

The shared vocabulary (grep these before hand-rolling):
- **Shared controls:** use `src/components/ui` for Button, Input, Textarea, Label,
  Card, Checkbox and Switch. `Button` variants preserve the Waffled pill styles;
  `unstyled` supports existing screen-specific controls.
- **Modals:** use `Modal` with the existing `.modal-card` surface and an `onClose`
  handler. The wrapper supplies the Radix portal, Escape, focus handling and backdrop.
  A visible heading names the dialog; pass `title` or `aria-label` for a surface without one.
- **Selection and icons:** use `SelectField` when choices contain icons; use
  `NativeSelect` for plain native choices. `DataIcon` renders legacy saved values as
  Lucide icons. `IconPicker` writes compatible values; `allowText` also accepts currency
  text. Render currency values with `IconValue`. Keep user-written text unchanged.
- **Styles:** preserve the existing tokens and selectors in `src/styles`; their
  declarations use Tailwind `@apply` with `@reference` to `ui.css`. Preflight is not
  enabled because the original document defaults are part of the existing style.
- **Data attributes:** shadcn uses `data-slot` internally. Meal drag targets must use
  `data-meal-slot` to identify the business cell before reading its slot key.
- **Labeled inputs in modals:** the `.field` / `.field-row` pattern (`styles/kiosk.css`).
  Pill selects use `.sel`.
- **Settings cards:** plain white card = `.set-card`. `.set-tray` is the *darker beige*
  group wrapper — only use it to intentionally group multiple cards; a lone card should
  not be wrapped in a tray.
- **Cook-mode / recipe timers:** the good timer-input pattern is `StepTimerControl` in
  `RecipeEditor.tsx` with `.re-timer-*` CSS (`styles/recipe.css`); the running-timer
  dock uses `.cm-timer-*` (`styles/cookmode.css`).
- **Meal placeholders** (leftovers / eating out / try-new) are `recipe_id NULL` rows
  whose `title` is regex-classified in `components/MealsColumn.tsx` and rendered as
  cards in `components/RecipeBrowser.tsx` — clone an existing card, don't invent a type.

**Verify front-end work by driving the running kiosk with Playwright (token +
screenshot) before calling it done** — a green unit test doesn't catch "looks like
unstyled HTML." (See the memory note of the same name.)
