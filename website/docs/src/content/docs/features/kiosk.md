---
title: Kiosk & display
description: The shared-tablet experience — device pairing, a profile picker, optional PINs, and the ambient screensaver.
---

![Waffled on an always-on iPad kitchen kiosk — the Today dashboard the whole household glances at](/screenshots/ipad-home.png)

Kiosk is the ambient-hub half of Waffled — the same web app, running fullscreen on a spare tablet on the kitchen counter, turned into a family command center. Pair a device, pick your profile from a Netflix-style picker, and the app hands you a real per-person session; when nobody touches it, it drifts into a photo screensaver with the clock, weather, and your next event. It's the surface the whole family walks past a hundred times a day. 📺

## Highlights

- 🔗 **Device pairing** — pair with an admin code or a one-tap "use this device"; on iPad, promote a device to kiosk and pair by code in one move. Single-login mode (no pairing) stays the **default**.
- 👥 **Profile picker** — a per-profile picker where claiming a profile mints a **real per-person session** (the device-token model), so each person gets their own scoped view.
- 🔒 **Optional per-person PIN** — 4–8 digits, throttled — a wrong code shows "**N tries left**" (401), and too many trips a short lockout (429, ~30s window).
- 🔁 **Switch & return** — switch profile at any time, and an idle timeout returns the device to the picker on its own.
- 🚪 **Exit / un-pair without signing in** — leave kiosk mode or un-pair the device without needing a login, so a shared tablet is never stuck.
- ☀️ **Keep-awake while displaying** — the screen stays on while it's acting as the hub.
- 🖼️ **Ambient screensaver** — idle auto-start after N minutes, a photo slideshow with crossfade, chrome (clock · date · weather · next event · album), scheduled night dimming, and a live Preview. See [Photos & screensaver](/features/photos/).
- 🧊 **Kiosk mode** — a per-device switch that hides creation and editing controls so a wall tablet shows only content. See [Kiosk mode](#kiosk-mode) below.
- 🌅 **Branded cold-start cover** — a Waffled cover shows while the first sync lands, so a booting tablet never looks broken.

## Where it works

| Surface | Support |
|---|---|
| Web / Kiosk | ✅ |
| iPhone | ❌ |
| iPad | ✅ |

The web build **is** the kiosk — run it fullscreen (PWA) on any counter tablet. iPad runs the full kiosk experience natively too. iPhone is **never** a kiosk: pairing, the profile picker, PINs, night-dimming, and keep-awake are all N/A there — the iPhone is a personal planner instead (see [Mobile app](/features/mobile/)).

## Settings

**Settings → Display & Kiosk** holds it all — screensaver source, speed, and shuffle; the idle timeout; night-dim schedule; and the live preview. Device **pairing** and per-person **PINs** are configured here too. For the operator's step-by-step how-to, see the [Kiosk & devices](/administration/kiosk/) admin page.

## Kiosk mode

Turn on **Settings → Display & Kiosk → Kiosk mode** on the tablet itself. It's saved on that device
only, so phones and laptops keep the full app.

**Hidden in Kiosk mode:** the "Add anything" capture bar, Customize on Today, the Getting started
card, every New / Add button (events, chores, goals, rhythms, lists, recipes, meals, rewards,
countdowns, photos), empty meal-plan slots, the grocery and list add bars, row edit and delete,
Scan and Add item in Pantry, Plan my week, Spot award, Edit recipe, Edit staples and Park a note.
Tapping an empty calendar slot no longer opens the new-event form.

**Still works:** checking off chores, groceries and list items, approvals, "I did it" on rhythms,
cook mode and its timers, and all navigation. The freed space goes to content.

To edit something, turn Kiosk mode off in the same place. Display & Kiosk is admin-only, so a
child can't switch it off. Kiosk mode is **web and kiosk only**; the iPad app doesn't have it yet.

## Module

Kiosk is **core — never gated**. There's no module toggle; the picker and screensaver are always available on a paired device.

## Notes

- 🙋 **Opt-in profile picker** — the shared-kiosk profile picker on iPad is opt-in; a single persistent login stays the default, so you only take on PINs and switching when you actually want them.
- 🧭 **Setup lives elsewhere** — this page is the feature overview; first-run setup, pairing steps, and OIDC config are web/server-only and live in [Kiosk & devices](/administration/kiosk/).
- 🌐 **LAN-served** — run the tablet against your Waffled server's address; if you're serving over TLS, see [Reverse proxy & TLS](/install/reverse-proxy/).
- 🚧 **Offline PWA caching** for the web kiosk is partial/planned — on mobile you get a native app instead of the browser PWA.
