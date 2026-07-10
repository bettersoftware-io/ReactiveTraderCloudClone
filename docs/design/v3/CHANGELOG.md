# Changelog — since v2

Everything in v2 is still here (5 themes × dark/light, depth themes, FLIP glides,
blotter flashes, smooth maximize). v3 is entirely about the **boot sequence**: the
splash went from 3 canvas variants to **8**, the five new ones being fully 3D,
Jarvis-hologram-inspired scenes. Rotation stays sequential per load/reboot via
`localStorage['rt_bootSeq']`.

## New boot variants (in rotation order)

4. **`hologram` — Volumetric market core.** A 3D "bar-chart city" assembles from flying
   particles over a circular emitter pad (light cone, radial ticks, expanding ground
   grid), wrapped in counter-rotating gyroscopic ring segments, a vertical scan ring,
   drifting dust motes, holo-flicker, and floating callout panels (FX CORE / RISK GRID /
   ORDER FLOW) tethered to the structure.

5. **`geo` — Western Europe tactical map.** Recognisable coastlines (continent, Great
   Britain, Ireland, Sicily, Sardinia, Corsica, Zealand — ~330 hand-placed lon/lat
   points, cos-corrected projection) trace themselves in as glowing polylines; a terrain
   dot-mesh raises the Alps / Pyrenees / Highlands; 12 capital nodes (London, Paris,
   Frankfurt, Milan, …) pulse with volume bars while **buy/sell trades arc city-to-city**
   as pulses with impact ripples. Graticule, radar sweep, live route counters.

6. **`layers` — Exploded UI compositor.** The app's own layout decomposes into 7
   z-separated wireframe layers (DevTools-Layers style): dashed ghost frames + corner
   tethers mark original positions, panels **pull out toward the camera one at a time**
   (glow, scan sweep, label + z-depth callout), the stack **tracks the cursor** in
   yaw/pitch, and everything recomposites flat exactly as the real app reveals.

7. **`jarvis` — Expo schematic.** The densest scene: a wireframe core sphere inside six
   layers of ring machinery (tick dials, counter-rotating segments, pavilion pads,
   highlighted arcs, a 120-tick degree ruler), eight radial spoke walkways, a radar
   wedge, and 14 depth-scattered blueprint fragments (data cards, dials, hex clusters
   with live nodes, meters, waveforms) that glitch in, get tethered and cross-linked.
   Opens at a pronounced 3/4 angle; rings **breathe along Z** at independent phases,
   fragments oscillate in depth and one **lunges at the camera every ~1.6s**; fully
   cursor-tracked.

8. **`topo` — Volatility terrain.** A mountain range built from six gaussian peaks is
   rendered as true **contour-line topography** (marching-squares iso-lines, 11 levels,
   precomputed once) over a sparse wireframe mesh, framed as a survey table. Contours
   reveal bottom-up with the newest level glowing; each summit carries a beacon labelled
   with an FX pair (EUR/USD, GBP/USD, USD/JPY, AUD/USD, EUR/GBP, USD/CHF) and a **live
   ticking price that flashes green/red** per tick; a route line links the summits; slow
   orbital camera + cursor steering.

## Notes for the developer

- All five new variants are **pure canvas-2D**, zero dependencies, and share one tiny
  math kernel: a yaw/pitch rotation + perspective divide (`P(x,y,z)` in each
  `_drawBoot*` function). Portable as-is into a `<BootSequence>` component.
- `layers`, `jarvis` and `topo` attach a `window` `mousemove` listener for cursor
  tracking and remove it when their rAF loop exits — keep that cleanup (or move it into
  the component's `useEffect` teardown) when porting.
- `geo` and `topo` precompute geometry once per boot (coastline point lists; a 52×36
  heightfield + marching-squares contour segments) and only project per frame — keep
  that split; recomputing contours per frame is the one thing that would hurt.
- The variant list is `['core','laser','docking','hologram','geo','layers','jarvis','topo']`
  in `_startBoot`; rotation index persists in `localStorage['rt_bootSeq']`.
- Respect `prefers-reduced-motion` in the real implementation (skip straight to the app
  or show the static wordmark + progress bar only).
