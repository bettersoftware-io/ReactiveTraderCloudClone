# Changelog — since v4

Everything in v4 is still here (8-variant boot rotation, 5 themes × dark/light, aurora
ambient, FLIP glides, blotter flashes). v5 adds one major feature area and one system:

## 1. J.A.R.V.I.S — AI desk assistant

A scripted (offline, deterministic) AI presence woven through the whole app. Butler-
formal persona; everything it reports comes from the **live mock state**, and everything
it does goes through the **real app actions** (tiles execute, blotters fill, panels
move).

- **Presence:** pulsating orb in the header (two switchable cores: MK-I Singularity /
  MK-II Reactor — also a `jarvisSkin` prop), unread badge, "agents armed" dot. Boot
  sequence gains a `J.A.R.V.I.S singularity core ... ONLINE` line.
- **Cinematic overlay:** Ctrl+J or click; dims/blurs the desk; holographic core,
  animated voice waveform, typed responses, suggestion chips, ESC/✕ to close.
- **Desk intelligence:** live quotes ("where is EURUSD?"), movers, spreads, session
  P&L, and a composed **morning briefing** (P&L, leaders/laggards, blotter counts,
  system health, armed agents).
- **Execution:** "buy 5M EURUSD" / "sell 200 NVDA" — drives the actual FX tile
  execution flow / equities order ticket, reports the fill (or rejection) back.
- **Desk control:** switch theme/mode, open tabs, filter the rates board by currency —
  by asking.
- **Sentinel agents:** "watch GBPUSD, buy 2M below 1.2600" arms a visible agent chip
  that monitors every tick; alert-only or auto-executing. Chips persist on the desk
  (bottom-left) when the overlay is closed; fired agents toast + report.
- **Generative widgets:** "build a volatility radar / correlation matrix / momentum
  heatmap / P&L gauge" — J.A.R.V.I.S assembles a live, draggable widget pinned to the
  desk, recomputed on every tick.
- **NL backtesting:** "backtest: buy the EURUSD dips" replays the session's recorded
  ticks through a toy strategy and pins an equity-curve widget (entries / winners /
  net P&L) with a verdict.
- **War-game drill:** "run a flash-crash drill" injects a synthetic shock into the real
  GBPUSD pricing stream — the whole desk reacts — with narration and a trough/recovery
  debrief.
- **Self-introspection:** "run system diagnostics" — subscription counts, leak check,
  P99 latency, SLO-breach narrative from the live metrics.
- **Morning workspace:** "set up my morning workspace" — J.A.R.V.I.S visibly drives the
  UI: switches desks, filters the board, pins a heatmap, arms a sentinel, then briefs.
- **Proactive:** occasional unprompted insights (biggest mover) as toasts; agent fires
  the same way.
- **Demo affordances:** ⓘ DEMO GUIDE panel (every command clickable, presenter tips) and
  **▶ RUN FULL DEMO** — a 13-step hands-free autoplay through all of the above,
  choreographing the overlay open/closed, with a progress pill + STOP.

Implementation: intent matching is a regex cascade in `_jvHandle` (source); agents are
checked per tick in `_jvCheck`; widgets are computed in `renderVals` from live state.

## 2. Cinematic audio layer

- **Boot music:** each of the 8 boot variants has a fixed music track + start offset
  (4 bundled mp3s, `map` in `_bootMusic`), faded in over the splash and out after the
  desk lands. A synthesized crescendo (`_bootMusicSynth`) is the fallback if the file
  can't play. Autoplay-blocked? Starts on first click/keypress.
- **UI sound effects:** fully synthesized Web Audio engine (no samples) with a shared
  reverb (generated impulse) + feedback-echo bus: clicks (auto-detected on any
  `cursor:pointer` element), buy/sell intervals, fill bells, reject thud, maximize/
  restore whooshes, J.A.R.V.I.S open/close swells, toast pings, drill alarm.
- **Voice:** the first J.A.R.V.I.S utterance plays a bundled voice clip
  (`jarvis-intro.mp4`) wrapped in a film-style comms treatment (chirp on/off + faint
  static/hum bed while speaking); browser TTS (UK-male preference) is the fallback.
  Only the first line per session is voiced, by design.
- **Preferences → AUDIO:** "Sound effects" and "J.A.R.V.I.S voice" switches
  (persisted; also `sound` / `voice` props).
