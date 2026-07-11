# Reactive Trader Mobile Redesign — Developer Handoff (mobile-v1)

This document explains what the prototype consists of and how to implement it in the
real **React Native client** (`packages/client-react-native`: Expo Router + TypeScript).
Every effect in the prototype was constrained to what Reanimated 3 / Skia / RN SVG can
do — nothing here requires the DOM.

---

## 1. What this is (and isn't)

- **Is:** a high-fidelity, interactive *design spec* — a single HTML file driven by a
  small component runtime, rendered inside a simulated iOS/Android frame, running on
  **mock data** generated client-side.
- **Isn't:** production code. No RxJS/services, no real navigation container, no
  native modules. Treat it as the visual + interaction target.

### How to run / inspect
- **Run:** open `../standalone/Reactive Trader Mobile.html` (self-contained, offline).
- **Edit the source:** `prototype/source/Reactive Trader Mobile.dc.html` is the markup
  + a single logic class; `support.js` is its runtime; `ios-frame.jsx` /
  `android-frame.jsx` draw the device chrome (all must sit together).
  All styling is inline; all logic lives in one `class Component`.

---

## 2. Feature inventory → RN mapping

| Area | What it does | RN implementation |
|---|---|---|
| **6 themes × dark/light** | holo / holo3d / terminal / terminal3d / neon / classic, switched live from the Appearance sheet; persisted | Extend `src/ui/theme/tokens.ts` with the token sets in `theme-tokens.ts`; theme context + `useTheme()`; persist with AsyncStorage |
| **Boot splash (8 variants)** | Canvas scenes cycled per launch, ~3.8–5.6s, skippable, theme+mode aware | `@shopify/react-native-skia` `<Canvas>` + `useFrameCallback`; see §4 |
| **Radial command dock** | Hex FAB fans out 5 module satellites over a blurred scrim | Reanimated: per-satellite `withDelay(i*45, withSpring())` on translate/scale; `expo-blur` scrim; `Pressable` targets ≥44px |
| **Ambient background** | Aurora blobs + HUD grid, per-theme intensity, user toggle | Skia gradients/blur (or two animated `LinearGradient`s); honor the perf toggle |
| **Rates** | Dense tick-flashing spot tiles, FLIP glides on filter, trade ticket sheet, execution ceremony (scan → FILLED stamp) | Flash: Reanimated `withSequence` scale on the pips text keyed by price dir; glides: `Layout` transitions on the grid; ticket: `@gorhom/bottom-sheet`; stamp: `withSpring` scale+rotate |
| **Blotter** | Live row inserts w/ colored flash; filter transitions (stayers glide, leavers fade, enterers rise) | FlatList + Reanimated `Layout` / `entering=FadeInDown` / `exiting=FadeOut`; insert flash via animated background color |
| **Analytics** | Streaming P&L area chart, pair P&L bars, breathing exposure bubbles | Skia `Path` for the area chart; bars/bubbles are plain `Animated.View`s with `withTiming` on width/size |
| **Credit** | RFQ cards w/ countdown rings, streaming dealer quotes, pulsing best-quote ACCEPT, accept ceremony (stamp → linger → fade-out + list glide), New-RFQ cascade, sell-side quoting | Countdown ring: Skia arc or `react-native-svg` `strokeDashoffset`; ACCEPT pulse: looping `withRepeat` shadow/scale; list transitions: `Layout` + exiting |
| **Equities** | Re-ranking movers board (rank-move glow: green up / red down), sparklines, live candles, order ticket + fill toast, positions | Re-rank: `Layout` transitions + a transient overlay tint (`entering`/auto-fade); sparkline/candles: Skia; toast: absolute header strip w/ `SlideInUp` |
| **Header / status strip** | Animated hex-reticle logo, env badge, connection pulse, latency/FPS/clock telemetry | Logo: `react-native-svg` + two Reanimated rotation loops; telemetry from real perf/connection signals |
| **Appearance sheet** | Theme cards, dark/light segmented toggle, ambient toggle, replay boot | Bottom sheet; theme swatches rendered from tokens |
| **Lock screen** | Hold-to-unlock progress ring with decay | `Gesture.LongPress`/`onPressIn` driving a shared value; SVG ring `strokeDashoffset`; add `expo-haptics` on unlock |
| **Safe areas** | iOS status-bar/home-indicator spacers, Android in-flow status bar | `react-native-safe-area-context` |

## 3. Theme system

`theme-tokens.ts` mirrors the shape already used by `src/ui/theme/tokens.ts` and the
prototype: per (theme × mode) — `bg, bg2, head, tile, overlay, text, dim, faint, onAcc,
pos, neg, aware, acc, acc2, border, bSub, bStrong, panel, pHead, chip, fD, fM,
glowC, tileGrad, topHi, shadow, gridC, aurora`.

- *3D* themes set `tileGrad` (two-stop vertical gradient) + `topHi` (inner top
  highlight) + `shadow` — implement as `LinearGradient` tile background + shadow props.
- Translucent `panel` values pair with blur (`expo-blur`) in holo/neon; terminal is
  opaque.
- Fonts: Chakra Petch + JetBrains Mono (holo/neon), IBM Plex Sans/Mono (terminal),
  Orbitron for the wordmark, system fonts for classic — load via `expo-font`.

## 4. Boot sequence (most directly portable)

Eight scenes, one draw function each, all pure 2D-canvas math — ports 1:1 to Skia
(`useFrameCallback` + `Canvas`, or `Skia.Picture`). Selection is sequential, persisted
(`localStorage['rtm_bootSeq']` → AsyncStorage). Durations: laser/docking 3.8s, the
rest 5.6s. SKIP button + fade-out handoff.

| # | name | function | scene |
|---|---|---|---|
| 1 | CORE SYNC | `_paintBootCore` | 3D wireframe globe, meridian laser sweep, 10 hub nodes w/ pings + callouts, buy/sell order arcs, gyro rings |
| 2 | UI DRAW-IN | `_paintBootLaser` | app panels laser-traced by a beam from an off-screen emitter; inner content flies in from depth |
| 3 | DOCKING CAM | `_paintBootDock` | SpaceX-style docking approach: station port, camera shake, PYR reticle, telemetry, lock brackets, contact flash |
| 4 | HOLO PROJECTOR | `_paintBootHolo` | volumetric market columns assembling from particles on an emitter pad |
| 5 | GEO TACTICAL | `_paintBootGeo` | EMEA coastline trace, terrain dot-mesh, city nodes, live trade arcs |
| 6 | LAYER COMPOSITOR | `_paintBootLayers` | the app UI z-decomposed into 7 layers, each pulled for inspection |
| 7 | SCHEMATIC CORE | `_paintBootJarvis` | ring machinery, wireframe sphere, 14 depth-scattered blueprint fragments |
| 8 | VOL TERRAIN | `_paintBootTopo` | marching-squares volatility terrain, summit beacons ticking live prices |

Porting notes:
- All 3D variants share one math kernel — yaw/pitch rotation + perspective divide
  (`const P = (x,y,z) => …`). Extract it once.
- The web versions' cursor parallax became autonomous drift here; on device, wire the
  drift inputs (`mx`, `my`) to `expo-sensors` gyroscope instead (the overlays already
  say "GYRO TRACK").
- `geo` / `topo` precompute geometry once per boot (`_initBootScene`) and only
  re-project per frame — keep this split.
- The palette comes from the active theme tokens; `_bootInk` / `_bootHot` provide the
  mode-aware scrim/highlight colors. Respect reduced-motion (skip to static splash).

## 5. Motion / feedback principle

The app is **calm until something real happens**. Ambient motion is limited to the
(per-theme, toggleable) aurora. Feedback fires on real events only: tick flashes,
row-insert flashes, rank-move glows, execution/accept ceremonies. Drive these from the
real price/trade streams, not timers. All animations are transform/opacity (UI-thread
safe with Reanimated worklets); list moves use Layout transitions — never animate
layout properties directly.

## 6. Mock data → real streams

Everything numeric is faked in the logic class (price walks, blotter generator, RFQ
quote timers, candles, exposure drift). Replace each with the corresponding real
service. The shapes to match are visible in the seed/factory helpers (`_seedTrades`,
`_seedRfqs`, `_seedStocks`, `_seedPnl`).

## 7. Suggested build order

1. Theme tokens + provider + Appearance sheet (persisted).
2. Header (logo, env badge, telemetry) + status strip + radial dock nav.
3. Rates: tiles + tick flashes + filter glides; trade ticket sheet + execution ceremony.
4. Blotter with insert flash + filter transitions.
5. `<BootSequence>` Skia component (start with CORE SYNC / UI DRAW-IN, add scenes
   incrementally) + lock screen.
6. Credit (RFQ lifecycle + ceremonies), Equities (movers board, candles, ticket),
   Analytics.
7. Gyroscope parallax, haptics, reduced-motion audit, perf pass (Hermes profile).
