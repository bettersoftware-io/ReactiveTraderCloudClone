# Reactive Trader — Futuristic Redesign Prototype (v3)

A visual / interactive design prototype that reimagines the Reactive Trader Cloud
client with a futuristic "HUD" aesthetic, five switchable themes (each with dark & light
modes), a dockview-style panel layout, event-driven motion (glides / flashes), an added
Equities module + Admin observability dashboard — and, new in v3, a rotation of
**eight cinematic 3D boot sequences** (Jarvis-hologram inspired), several of them
cursor-tracked.

> ⚠️ This is a **design artifact**, not production code. It runs on mock data and a
> lightweight rendering runtime. It shares no code with the real React/RxJS app — it is
> a reference/spec for implementing the design in the real codebase.

This folder contains two things (plus `CHANGELOG.md` listing what changed since v2):

## 1. `standalone/` — just run it
`standalone/Reactive Trader.html` is a single, self-contained file (all scripts, styles
and fonts inlined). **Double-click it** — it opens in any modern browser, works offline,
and behaves exactly like the live prototype. Use this for demos, design review, and
sharing. Nothing to install.

Tip: the boot splash cycles through the 8 variants in order on each load/reboot
(account menu → *Reboot HUD*). Move the mouse during the `layers`, `jarvis` and `topo`
variants — they track the cursor in 3D.

## 2. `dev-handoff/` — implement it in the real app
A package for a developer (or Claude Code) porting the design into the production
React app. Contains:

- `HANDOFF.md` — what the prototype consists of and how each piece maps to the real
  React + RxJS + styled-components architecture, plus a suggested build order.
- `theme-tokens.css` — the themes as ready-to-use CSS custom properties.
- `prototype/Reactive Trader.html` — the runnable standalone (same as above).
- `prototype/source/` — the **editable** source: `Reactive Trader.dc.html` (markup +
  logic) and its runtime `support.js`. Open the `.dc.html` directly in a browser to run
  the editable version (keep `support.js` next to it).

## Where to put this in the repo
Commit this whole folder as `docs/design/v3/`, alongside `v1/` and `v2`. It is
self-contained and has no build step.
