# Changelog — since v3

Everything in v3 is still here (8-variant boot rotation, 5 themes × dark/light, FLIP
glides, blotter flashes). v4 has three changes:

## 1. `core` boot variant rebuilt — global market mesh

The original variant-1 globe (flat wireframe + radar sweep) was the weakest of the
eight; it's been rebuilt to match the fidelity of the newer 3D scenes (ported back from
the React-Native edition of this prototype):

- Meridians sweep in pole-to-pole with bright glowing draw-heads; parallels fill in
  behind; a scan ring sweeps the sphere south → north.
- Counter-rotating gyroscopic segmented rings wrap the globe.
- **10 trading-hub nodes** (LON, NYC, TYO, SGP, SYD, FRA, HKG, ZRH, SAO, DXB) ping with
  expanding ripples; a rotating spotlight callout labels one front-facing hub at a time
  with a live flow readout.
- **Buy/sell order-flow arcs** fire hub-to-hub as bright-headed pulses over great-circle
  paths, with impact ripples on arrival; live LINKS/LIVE counters in the telemetry.
- Star-drift backdrop, nucleus glow, screen-space calibration ticks, holo-flicker, and
  the standard status banner (SPINNING UP CORE → LINKING GLOBAL NODES → MESH ONLINE).

Function: `_drawBoot` in the source. Same portable canvas-2D pattern as all variants
(yaw/pitch projection kernel `P3` + spherical helper `SPH`).

## 2. Aurora ambient background (holo/neon themes)

The drifting accent-colored blobs + center radar sweep are replaced by a **realistic
northern-lights scene**: three curtain layers of vertical rays (green/teal, purple/
magenta, and a sharp white-cored shimmer layer) with arched bottom edges concentrated
in the upper sky, over soft green→blue→violet washes and a faint purple sky tint.
Fixed aurora palette (not theme-accent-tinted) so it reads as an aurora in every theme.
Layers sway/skew independently via `auroraA`–`auroraE` keyframes; still gated behind
the Animated background toggle and `--auroraOp` per theme.

## 3. New preference — Ambient style

Preferences → Display gains an **Ambient style** segmented control:
- **Aurora** (default) — the new northern-lights curtains.
- **Rays** — the original accent-tinted blobs + rotating radar sweep, preserved as-is.

Stored as `prefs.ambientStyle`; both styles respect Animated background / Reduce motion.
Implementation: two `<sc-if>` branches on the ambient layer, flags `ambAurora` /
`ambRays` from `renderVals`.
