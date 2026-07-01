# Reactive Trader — Futuristic Redesign Prototype

A visual / interactive design prototype that reimagines the Reactive Trader Cloud
client with a futuristic "HUD" aesthetic, three switchable themes, an animated boot
sequence, a dockview-style panel layout, and an added Equities module + Admin
observability dashboard.

> ⚠️ This is a **design artifact**, not production code. It runs on mock data and a
> lightweight rendering runtime. It shares no code with the real React/RxJS app — it is
> a reference/spec for implementing the design in the real codebase.

This folder contains two things:

## 1. `standalone/` — just run it
`standalone/Reactive Trader.html` is a single, self-contained file (all scripts, styles
and fonts inlined). **Double-click it** — it opens in any modern browser, works offline,
and behaves exactly like the live prototype. Use this for demos, design review, and
sharing. Nothing to install.

## 2. `dev-handoff/` — implement it in the real app
A package for a developer (or Claude Code) porting the design into the production
React app. Contains:

- `HANDOFF.md` — what the prototype consists of and how each piece maps to the real
  React + RxJS + styled-components architecture, plus a suggested build order.
- `theme-tokens.css` — the three themes as ready-to-use CSS custom properties.
- `prototype/Reactive Trader.html` — the runnable standalone (same as above).
- `prototype/source/` — the **editable** source: `Reactive Trader.dc.html` (markup +
  logic) and its runtime `support.js`. Open the `.dc.html` directly in a browser to run
  the editable version (keep `support.js` next to it).

## Where to put this in the repo
Suggested: commit this whole folder under `design/prototype/` (or `docs/design/`) as a
living reference. It is self-contained and has no build step.
