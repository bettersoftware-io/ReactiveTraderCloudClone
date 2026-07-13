# Reactive Trader — Futuristic Redesign Prototype (v5)

A visual / interactive design prototype that reimagines the Reactive Trader Cloud
client with a futuristic "HUD" aesthetic, five switchable themes (each with dark & light
modes), a dockview-style panel layout, event-driven motion, an Equities module + Admin
observability dashboard, a rotation of **eight cinematic 3D boot sequences** — and, new
in v5, **J.A.R.V.I.S**: a built-in AI desk assistant (scripted, offline) with autonomous
monitoring agents, generative widgets, a hands-free demo mode, and a full cinematic
audio layer (per-boot-variant music, synthesized UI sounds, spoken intro).

> ⚠️ This is a **design artifact**, not production code. It runs on mock data and a
> lightweight rendering runtime. It shares no code with the real React/RxJS app — it is
> a reference/spec for implementing the design in the real codebase.

This folder contains two things (plus `CHANGELOG.md` listing what changed since v4):

## 1. `standalone/` — just run it
`standalone/Reactive Trader.html` is a single, self-contained file (all scripts, styles,
fonts **and audio** inlined). **Double-click it** — it opens in any modern browser,
works offline, and behaves exactly like the live prototype. Use this for demos, design
review, and sharing. Nothing to install.

Demo tips:
- Click the pulsating orb in the header (or **Ctrl+J**) to summon J.A.R.V.I.S.
- Inside the overlay, **ⓘ DEMO GUIDE** lists every command (each line is clickable) and
  **▶ RUN FULL DEMO** plays the entire ~2½-minute scenario hands-free (ESC stops it).
- Browsers block audio until the first interaction — click anywhere during the boot
  splash to unlock the music. Sound/voice toggles live in Preferences → AUDIO.

## 2. `dev-handoff/` — implement it in the real app
A package for a developer (or Claude Code) porting the design into the production
React app. Contains:

- `HANDOFF.md` — what the prototype consists of and how each piece maps to the real
  React + RxJS + styled-components architecture, plus a suggested build order.
- `theme-tokens.css` — the themes as ready-to-use CSS custom properties.
- `prototype/Reactive Trader.html` — the runnable standalone (same as above).
- `prototype/source/` — the **editable** source: `Reactive Trader.dc.html` (markup +
  logic), its runtime `support.js`, and the audio assets (`boot-music*.mp3`,
  `jarvis-intro.mp4`). Open the `.dc.html` directly in a browser to run the editable
  version (keep the other files next to it).

## Where to put this in the repo
Commit this whole folder as `docs/design/v5/`, alongside `v1/`–`v4/`. It is
self-contained and has no build step.
