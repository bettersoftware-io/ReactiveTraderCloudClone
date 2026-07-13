# Reactive Trader Redesign — Developer Handoff (v5)

This document explains what the prototype consists of and how to implement it in the
real **Reactive Trader Cloud** client (TypeScript + React + RxJS + styled-components).

---

## 1. What this is (and isn't)

- **Is:** a high-fidelity, interactive *design spec* — a single HTML file driven by a
  small component runtime, running on **mock data** generated client-side.
- **Isn't:** production code. It does not use RxJS, the real domain models, the
  OpenFin/services layer, or the backend. Treat it as the visual + interaction target.

You re-implement the **look, motion, and layout** in the real app; you keep the real
app's data and architecture.

### How to run / inspect
- **Run:** open `prototype/Reactive Trader.html` (self-contained, offline).
- **Edit the source:** `prototype/source/Reactive Trader.dc.html` is the markup + a
  single logic class; `support.js` is its runtime; the mp3/mp4 files are the audio
  assets (all must sit next to the `.dc.html`). All styling is inline; all logic lives
  in one `class Component`.

---

## 2. Feature inventory

| Area | What it does | Real-app mapping |
|---|---|---|
| **5 themes + dark/light** | holo / holo3d / terminal / terminal3d / neon, switchable live; ☀/☾ flips dark↔light | `ThemeProvider`; two token objects per theme (`themes` / `themesLight`) |
| **Depth themes** | *3D* themes add gradient panels + layered shadows; tiles/RFQ cards raised in all themes | `panelShadow` / `tileShadow` / `tile` tokens |
| **Boot sequence** | Animated `<canvas>` splash; **8 variants** cycled in order, five full-3D, three cursor-tracked; each has a fixed music track (v5) | `<BootSequence>` React component — see §4 |
| **J.A.R.V.I.S** *(v5)* | AI desk assistant: chat overlay, live-data Q&A, command execution, sentinel agents, generative widgets, backtests, drills, autoplay demo | See §5 — port UI + protocol; swap scripted brain for a real LLM + tool-calling |
| **Audio layer** *(v5)* | Boot music per variant, synthesized UI SFX (Web Audio), voice intro + comms treatment | See §6 |
| **Dock layout** | Resizable split panels, maximize, collapse-to-strip | Use the real **dockview** library |
| **Event-driven motion** | FLIP glides, blotter row-insert flash, RFQ ACCEPT pop | Drive from real RxJS streams |
| **FX** | Live rate tiles, exec overlays, RFQ-on-tile, blotter | Existing `LiveRates` + `Trades` — restyle |
| **Credit** | New-RFQ form, streaming dealer quotes, accept/expire, blotter | Existing `Credit` flow — restyle |
| **Equities** *(v2)* | Watchlist, candles, tabs, order ticket, blotters | New module — needs real services |
| **Admin** *(v2)* | Observability dashboard | Wire to real telemetry |
| **Header / status bar / prefs / lock screen** | Chrome, clock, latency, preferences modal (incl. AUDIO section, v5), session lock | Presentational + real prefs/auth |

## 3. Theme system

Unchanged from v4 (see `theme-tokens.css` and the `themes` / `themesLight` objects in
the source). Ambient background: `Aurora` / `Rays` styles behind Preferences → Display.
Semantic tokens to preserve: `accent` / `accent2`, `buy` / `sell`, `panel`, `glow`,
`auroraOp`, depth tokens `tile` / `tileShadow` / `panelShadow`. Fonts: Chakra Petch +
JetBrains Mono (holo/neon), IBM Plex Sans/Mono (terminal), Orbitron (wordmark).

## 4. Boot sequence

Pure `<canvas>` 2D, no dependencies; 8 variants, one draw function each; sequential
selection persisted in `localStorage['rt_bootSeq']`; `DUR = 4200ms`; SKIP control +
cross-fade. Variant keys/functions: `core`/`_drawBoot` (market-mesh globe),
`laser`, `docking`, `hologram`, `geo`, `layers`, `jarvis`, `topo` (see v4 handoff table —
unchanged). Port as `<BootSequence onDone=…>`; respect `prefers-reduced-motion`.

**v5:** `_bootMusic` maps each variant to a bundled track + start offset and fades it
in/out over the splash; `_bootMusicSynth` is the no-asset fallback. Music selection
happens *after* the variant is chosen — keep that coupling.

## 5. J.A.R.V.I.S (v5) — anatomy and porting

All J.A.R.V.I.S state lives in the one logic class, prefixed `jv` / `_jv`.

**UI pieces** (template, all inline-styled):
- Header **orb** (two skins, unread badge, agents dot) → small React component.
- **Overlay**: full-screen, dims/blurs desk; core, waveform, message list (typed-out
  reveal), suggestion chips, input row, footer (demo/guide/skin switches), ⓘ guide
  panel. → `<JarvisOverlay>`.
- **Desk artifacts**: agent chips (bottom-left), draggable live widgets (right rail),
  toast (bottom-right), autoplay progress pill (top-center).

**Brain** — `_jvHandle(raw)`: a regex-cascade intent matcher over lowercase input;
every answer is composed from **live state** (rates, opens, hist, pnl, blotters,
metrics) and every action calls the **same methods the UI calls** (`book`, `selectEq`,
`setState({theme…})`). This is the seam for production: replace the cascade with a real
LLM + tool-calling (each `if` branch ≙ one tool: `quote`, `trade`, `armAgent`,
`buildWidget`, `backtest`, `drill`, `diagnostics`, `workspace`, `briefing`, `navigate`),
keep the same tool surface so the UI is unchanged.

**Subsystems:**
- **Speech queue**: `_speak` → `_speakQ` → `_jvNextSpeech` types messages out at ~26ms/
  2-4 chars; waveform + status derive from `jvSpeaking`.
- **Agents**: `jvAgents[]` `{sym, kind, dir?, notional?, op, level, status}`; checked
  every tick in `_jvCheck`; alert-only → toast+speech, trading → `_jvFxTrade`. In
  production: server-side or RxJS `filter` on the price stream.
- **Widgets**: `jvWidgets[]` rendered in `renderVals` (radar/corr/heat/gauge/backtest
  equity curve), recomputed per tick from live state; draggable via pointer events
  writing `jvWpos`. In production: real chart lib fed by streams; keep the "assembled
  by AI, dismissable, draggable" affordance.
- **Backtester**: `_jvBacktest` replays `_rec` (rolling 600-tick recording per pair,
  captured in `_jvCheck`) through a buy-dip/take-profit toy strategy.
- **Drill**: `_jvDrill` pushes a scripted delta sequence into the tick loop via
  `_jvShock` — the *entire desk* reacts because it flows through the normal pricing
  path. Keep that principle: inject at the stream, not the component.
- **Autoplay**: `startAutoplay` walks `_autoSteps[]` (13 steps), each `{label, cmd?,
  ui?, pre?, min?, gap?}`, polling until speech settles before advancing; progress pill;
  ESC/STOP halts. `pre` hooks rig the market so agent-fire demos reliably.
- **Proactive**: low-probability biggest-mover insight in `_jvCheck` (throttled 50s).

## 6. Audio (v5)

- **Engine**: one `AudioContext` (`_ac()`) with a master gain, a feedback-echo bus and
  a convolution reverb (impulse generated in-code — no samples). Helpers: `_tone`
  (osc + filter + envelope, optional detuned stack), `_bell` (inharmonic partials),
  `_noise` (filtered noise). All SFX are synthesized in `_sfx(name)`:
  click / buy / sell / fill / reject / ping / alarm / max / restore / openJv / closeJv /
  commOn / commOff.
- **Auto-click sound**: a capture-phase `pointerdown` listener walks 4 ancestors for
  `cursor:pointer` — one listener covers every interactive element. Port as a tiny
  provider; gate behind the SFX pref.
- **Voice**: first utterance plays `jarvis-intro.mp4` (an `Audio` element) wrapped in
  comm chirps + a static/hum bed (`_commBedOn/Off`); `speechSynthesis` (UK-male
  preference, pitch 0.7) is the fallback; hard-capped at one voiced line per session
  (`_sayCount`). For production, swap in a hosted TTS voice.
- **Unlock**: browsers block audio pre-gesture — `_sndGesture` resumes the context and
  starts pending boot music on first pointer/key event.
- **Prefs**: `sndOn` / `voiceOn` in Preferences → AUDIO, persisted to `localStorage`
  (`rt5_snd`, `rt5_voice`); also exposed as `sound` / `voice` props.

## 7. Mock data → real streams

Everything numeric is faked in the logic class (rate walks, RFQ timers, candles,
metrics, `_rec` tick recording). Replace each with the corresponding real service/RxJS
stream; shapes are visible in the seed/factory helpers.

## 8. Suggested build order

1. Theme tokens + `ThemeProvider` + switcher.
2. Re-skin FX + Credit.
3. `<BootSequence>` (+ per-variant music hook).
4. dockview layout + pinned blotters + maximize/collapse.
5. Header chrome, status bar, preferences (incl. AUDIO), lock screen.
6. Audio engine provider (SFX + unlock + prefs).
7. J.A.R.V.I.S UI shell (orb, overlay, chips, widgets rail) on the scripted brain.
8. Swap scripted brain → LLM tool-calling behind the same tool surface.
9. Equities module; Admin dashboard.
