# Reactive Trader Mobile — Futuristic Redesign Prototype (mobile-v1)

A visual / interactive design prototype that reimagines the **React Native client**
(`packages/client-react-native`) with the same futuristic "HUD" aesthetic as the
desktop v2/v3 redesigns: six switchable themes (each with dark & light modes), a
radial command-dock navigation, event-driven motion everywhere (FLIP glides, tick
flashes, execution ceremonies), and a rotation of **eight cinematic boot splash
sequences** — all designed so that every effect is implementable in React Native
(Reanimated / Skia / Moti / react-native-svg).

> ⚠️ This is a **design artifact**, not production code. It runs on mock data and a
> lightweight rendering runtime in a simulated phone frame. It shares no code with the
> real RN app — it is a reference/spec for implementing the design in
> `packages/client-react-native`.

This folder contains two things:

## 1. `standalone/` — just run it
`standalone/Reactive Trader Mobile.html` is a single, self-contained file (all scripts,
styles and fonts inlined). **Double-click it** — it opens in any modern browser, works
offline, and behaves exactly like the live prototype. Use this for demos, design
review, and sharing. Nothing to install.

Tips:
- The boot splash cycles through the 8 variants in order on each load / replay
  (Appearance sheet → *Replay boot sequence*).
- The ◐ header button opens the Appearance sheet (6 themes × dark/light, ambient
  background toggle); ⌖ locks the session (hold the ring to unlock).
- The hexagonal button in the bottom dock fans out the radial module picker
  (Rates / Blotter / Analytics / Credit / Equities).

## 2. `dev-handoff/` — implement it in the real RN app
A package for a developer (or Claude Code) porting the design into
`packages/client-react-native`. Contains:

- `HANDOFF.md` — what the prototype consists of and how each piece maps to
  React Native (Reanimated 3 / Skia / gesture-handler), plus a suggested build order.
- `theme-tokens.ts` — the 6 themes × dark/light as a ready-to-use TypeScript module
  shaped for the existing `src/ui/theme/tokens.ts`.
- `prototype/source/` — the **editable** source: `Reactive Trader Mobile.dc.html`
  (markup + logic) with its runtime `support.js` and the phone-frame components
  (`ios-frame.jsx`, `android-frame.jsx`). Open the `.dc.html` directly in a browser to
  run the editable version (keep the sibling files next to it).

## Where this lives in the repo
This folder lives at `docs/design/mobile/v1/` — the first entry under
`docs/design/mobile/`, the mobile counterpart to the web prototypes under
`docs/design/web/`. It is self-contained and has no build step.
