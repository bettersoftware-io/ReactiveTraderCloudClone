# Five RN boot scenes render blank on device — investigation handoff

**Status: RESOLVED 2026-07-31.** All eight boot variants render on device
(iPhone 17 / iOS 26.5). There were **three** causes, not one; §9 records them
and the measurement error that hid two of them. The rest of this document is
kept as written on 2026-07-27, because its disproven table is still the reason
not to re-run four dead theories.

This was a handoff document. It records what is **proven**, what is
**disproven** (with evidence, so nobody re-runs those experiments), and the
exact reproduction loop.

---

## 1. Symptom

On iPhone 17 / iOS 26.5 (dev client + Metro), five of the eight boot variants
paint **nothing** — a white screen with an RN error toast reading
`TypeError: undefined is not a function`. One session logged 253 of them.

| Scene | On device | Same-file worklet→worklet forward refs |
|---|---|---|
| `core` | ✅ renders | 0 |
| `laser` | ✅ renders | 0 |
| `docking` | ✅ renders | 0 |
| `static` | ✅ renders | n/a (`BootEmblem`, not a Skia scene) |
| `hologram` | ❌ blank | 1 |
| `layers` | ❌ blank | 8 |
| `geo` | ❌ blank | 2 |
| `jarvis` | ❌ blank | 9 |
| `topo` | ❌ blank | 2 |

The live boot splash is affected, not just the visual harness: a cold launch
into the persisted `geo` variant paints white for its whole duration. **This is
not a simulator artefact** — see §5 for the two things that are.

## 2. What is PROVEN

### 2.1 A worklet cannot call a worklet declared later in the same file

Measured on device with `typeof` probes inside `LayersScene`'s `drawPanels`
worklet:

```
panelWorldRect=function      <- imported from layersGeometry.ts
projectBootPoint=function    <- imported from boot3dCamera.ts
panelAlpha=function          <- imported
panelDrawPhase=function      <- imported
drawGhostFrame=undefined     <- same file, declared BELOW drawPanels
drawBackdropLayer=undefined  <- same file, below
drawPanelFace=undefined      <- same file, below
drawPanelContent=undefined   <- same file, below
drawLayerTag=undefined       <- same file, below
drawPulledOverlay=undefined  <- same file, below
```

`drawPanels` is at line 273; every `undefined` name is declared at 476+.

**Confirmed causally**, not just correlationally: moving `drawGhostFrame` above
`drawPanels` flipped it, while its still-below sibling did not move:

```
drawGhostFrame=function      <- after moving it above the caller
drawPanelFace=undefined      <- left in place
```

**Mechanism.** The worklets Babel transform rewrites `function foo()` into a
non-hoisted binding, and builds each worklet's `__closure` by value at module
evaluation. A worklet defined earlier therefore captures a later sibling before
it is initialised. Imports are live module bindings evaluated first, so they are
immune. The transform *intends* the capture — the generated code destructures
`drawGhostFrame` from `this.__closure` — it is simply `undefined` at capture
time.

### 2.2 Two genuinely missing `"worklet"` directives (separate bug)

Found by static audit, unrelated to §2.1 and NOT the cause of the blanking:

- `geoGeometry.ts` → `geoPointInside`, called per frame by `GeoScene`'s
  `drawRadarSweep`. Its own header claims the sweep "builds its own marked
  wrapper" — no such wrapper exists.
- `topoGeometry.ts` → `topoHeightAt`, called per frame from three sites in
  `TopoScene`.

The `geoPointInside` fix shipped on `main` in #413. It is correct on its own
terms, but **it does not make `geo` render**.

### 2.3 Reordering does not violate the repo's lint rules

`newspaper-order` does **not** flag callee-before-caller ordering in these
files. Verified: reordered `HologramScene` → `pnpm exec eslint <file>` exits 0.
So the cheap fix shape is available; no rule change or module split is needed
for lint reasons.

## 3. What is DISPROVEN — do not re-run these

| Theory | Why it is wrong |
|---|---|
| **Deprecated `SkPath` API.** Metro logs `SkPath.moveTo()/lineTo() is deprecated`. | Deprecation warnings only. Both methods still exist; the scenes call no removed method. Checked every path method used against the installed `Path.d.ts`. |
| **`Skia.PathEffect.MakeDash` removed.** Every blank scene calls it. | Still declared and present. `docking` also calls it and renders — its pinned frame simply never reaches that line. |
| **Cross-package worklets don't transform.** `projectBootPoint` → `project3d` in `@rtc/motion-core` (a built dist), used by exactly the 5 broken scenes. | The correlation is real but the cause is not. `CoreScene` reaches `project3d` via `projectGlobeVector` and renders fine. Bundle inspection shows `project3d` correctly captured through `__closure`. |
| **Worklets Babel plugin applied twice.** It is listed in `plugins` *and* auto-injected by `babel-preset-expo`. | Babel de-duplicates. Removing the explicit entry left the bundle byte-comparable: `__workletHash` count 1202 before and after. Reverted. |
| **Fixing forward refs fixes the scenes.** | **This is the important one.** `hologram` has exactly one forward ref (`gridPoint`). Reordering it left zero detected forward refs — and the scene *still renders blank with the same error*. So §2.1 is real but incomplete. |

## 4. Where the trail stops

After the `hologram` reorder, a `typeof` probe inside its picture worklet showed
**all 13 local functions resolving as `function`**. The error still fires. The
next step is to find the actual failing call inside one of those helpers.

A step-marker bisect was attempted and produced `hstep=start`, implying failure
before the first draw call — but **that instrumentation was buggy** (markers were
injected into module-level function definitions rather than the callback scope),
so the result is worthless. Discard it and re-instrument.

Untested hypotheses, in the order worth trying:

1. A helper calls something undefined *inside* it — instrument one helper at a
   time with correctly-scoped `typeof` probes.
2. The detector in §6 only sees `function` declarations and direct `name(`
   calls. It misses arrow-function consts, functions passed as values, and
   indirect calls. Widen it before trusting "zero forward refs".
3. Nested arrow callbacks inside a worklet (`order.sort((a, b) => …)`) may not
   be workletised.

## 5. Two things that are NOT bugs

- **The `__visual/boot/*` harness scenes are frozen on purpose.** They pin
  `elapsedSec` to a fixed instant so goldens reproduce. Static is correct there;
  it says nothing about whether the live splash animates.
- **`simctl boot` starts the runtime headlessly.** Screenshots work with no
  visible window. Run `open -a Simulator` to see it.

## 6. Reproduction and tooling

```bash
# Metro from the worktree (NOT with CI=1 — that disables reloads and silently
# serves a stale bundle; this cost one wrong "verified" result)
cd packages/client-react-native
EXPO_PUBLIC_VISUAL_HARNESS=1 EXPO_NO_TELEMETRY=1 npx expo start --dev-client --port 8081 --clear

# Load the app, then deep-link a scene
xcrun simctl openurl <UDID> "exp+rtc-mobile://expo-development-client/?url=http://localhost:8081"
xcrun simctl openurl <UDID> "rtcmobile://__visual/boot/layers"
xcrun simctl io <UDID> screenshot out.png

# Blank-detection without eyeballing: a rendered scene is dark, blank is ~white
magick out.png -colorspace Gray -format '%[fx:mean]\n' info:
#   ~0.97-0.99 => blank   |   ~0.63-0.79 => drawing
```

`scripts/check-worklet-order.mjs` (added with this document) reports
worklet→worklet forward references. It reproduces the 5-broken / 3-clean split
exactly, which is why it is worth keeping — but see §4.2 for its blind spots.

## 7. Why the test suite cannot see any of this

Two independent reasons, either sufficient:

- `babel.config.js` disables both worklet plugins under `api.env("test")`, so no
  worklet is ever transformed in jest.
- `react-native-reanimated` is wholesale-mocked in `jest.setup.ts`, so no
  worklet ever runs.

Everything executes on one thread in tests. **A green suite is not evidence
about any of this**, and 295 passing RN tests coexisted with five dead scenes.

## 8. How this shipped

The five broken scenes merged across #382, #383, #390–#393, each recorded as
"not verified on device". The documented reason for the caveat — jest is
structurally blind to the worklet class — was precisely the reason not to merge
on green tests. Four scenes' worth of breakage accumulated behind that decision
before anyone looked at a device.

The lesson is not "test more"; the suite cannot be made to see this. It is that
a Skia/Reanimated scene has **no** meaningful verification short of running it,
and should not merge without one.

## 9. Resolution (2026-07-31)

Three causes, all of the same family — *a worklet reaching something that is not
yet initialised, or not a worklet at all* — but only one of them was visible to
the detector as it stood.

| # | Cause | Where | Symptom |
|---|---|---|---|
| 1 | worklet → worklet declared later in the same file | 24 sites across 5 files | `undefined is not a function` |
| 2 | worklet → module-level **`const`** declared later | `LayersScene`'s `CORNER_UVS` | `Cannot convert undefined value to object` |
| 3 | missing `"worklet"` directive | `topoGeometry.topoHeightAt`, 3 call sites | `Tried to synchronously call a Remote Function` |

**Why §3's "reordering does not fix it" was wrong.** It was a measurement error,
not a missing cause. `hologram` reaches *two* forward references: `gridPoint` in
its own file, and `gyroYawPitch → clampUnit` in the shared `boot3dCamera.ts`.
Only the first was reordered. The detector reported the file clean because its
regex was anchored on `^function`, so an `export function` was never registered
as a caller at all — and `gyroYawPitch` is exported. The scene had one cause
fixed and one untouched, and the clean report was read as "no causes left".

**The discarded bisect was right.** §4 records a step-marker bisect that
produced `hstep=start` — failure before the first draw call — and discards it as
buggy instrumentation. It was correct. `gyroYawPitch` is called at the *top* of
every projected scene's draw, above the first draw call, so the marker was
telling the truth. Instrument-distrust is usually the right instinct; here it
cost the answer. Worth remembering that a result which contradicts a hypothesis
is evidence about the hypothesis first.

**Cause 2 is the structural one.** A worklet captures every module-level binding
by value — constants exactly as much as functions. A function-only detector can
therefore never be sufficient, no matter how many blind spots it closes, and the
old header's "necessary but not sufficient" caveat was understating the problem:
it was not measuring the right *kind* of thing. `layers` stayed blank through a
complete function reorder for exactly this reason.

**What now guards it.** `scripts/check-worklet-order.mjs` covers all three
classes, resolves imports across the tree for class 3, strips comments (three
phantom findings and one mis-attributed caller came from matching names inside
JSDoc), and exits non-zero. It runs in CI's `checks` job and in
`/rtc:gauntlet`'s fast tier. It was verified in both directions: clean on the
fixed tree, and 28 findings — including the late `const` and all three
`topoHeightAt` call sites — when run against the pre-fix sources.

It is still **not** a substitute for running the app. It cannot see an
arrow-function worklet, a function passed as a value, or anything dynamic, and
no static check can prove a Skia scene draws what it should. It closes the class
that produced this outage; the device remains the only witness that a scene
renders.

**Verified on device**, all eight variants, mean grey (>0.9 is blank):

| scene | mean | | scene | mean |
|---|---|---|---|---|
| core | 0.751 | | hologram | 0.750 |
| laser | 0.790 | | layers | 0.720 |
| docking | 0.631 | | geo | 0.751 |
| static | 0.992 (emblem, light by design) | | jarvis | 0.728 |
| | | | topo | 0.727 |

`topo` has no registered scenario (T10), so it was captured through a temporary
local registration that was reverted afterwards — it is verified, but it is not
covered by the harness.
