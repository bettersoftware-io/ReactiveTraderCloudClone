# RN Appearance sheet — design

**Status:** designed, not built. **Date:** 2026-08-09.
**Scope:** `@rtc/client-react-native` presentation only. No port, preference,
domain or wire changes.

## Problem

The mobile Appearance surface does not match the mobile-v1 design in form,
layout or content. Compare
[`reference-shots/shell/appearance.png`](../../design/mobile/v1/reference-shots/shell/appearance.png)
against the committed golden
[`shell/appearance`](../../../packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/shell/appearance.png):

| | design | today |
|---|---|---|
| container | bottom sheet over the dimmed app, grab handle | full-screen opaque overlay with `CLOSE ✕` |
| mode | one `DARK \| LIGHT` segment inline in the header | a `Dark · Tap to change` row **and** a separate Dark/Light segment — two controls for one setting |
| skins | 3×2 grid of cards, three swatches each | six full-width rows, two-swatch chip, `✓` on the selected row |
| skin order | HOLO HUD, HOLO 3D, TERMINAL, TERMINAL 3D, NEON, CLASSIC | CLASSIC first |
| ambient | one row + subtitle + toggle | `Motion` section, `ON/OFF` row, then more controls |
| typography | mono, uppercase, letterspaced | mixed; proportional sentence case |

## The constraint that shapes everything

**The design has no slot for three shipped features.** It predates them; it is a
*visual* reference, not a feature inventory.

| ours | the design's provision |
|---|---|
| Mode: **System** / Dark / Light | a 2-way toggle — cannot express System |
| Ambient variant: **Aurora / Rays** | a single on/off toggle |
| Power saver: **Off / Calm / Freeze** | absent entirely (PRs #218 / #245 / #255) |

So "make it match the prototype" would delete an entire shipped workstream.
**Decision: adopt the design's FORM, carry our fuller content.** This is the
`Prototype ↔ data-model mismatches` tension already recorded in
[`STATUS.md`](../../STATUS.md) — resolved here in favour of the app, because the
prototype is simply older.

## Target structure

```
╭────────────── ━━━ ──────────────╮   grab handle
│ APPEARANCE   [SYS|DARK|LIGHT]  │   header + mode, one row
│ ┌─────┐ ┌─────┐ ┌─────┐        │
│ │■■■  │ │■■■  │ │■■■  │        │   3×2 skin cards,
│ │HOLO │ │HOLO3│ │TERM │        │   3 swatches + mono label,
│ └─────┘ └─────┘ └─────┘        │   selected = ring (no ✓)
│ ┌─────┐ ┌─────┐ ┌─────┐        │
│ │TERM3│ │NEON │ │CLASS│        │
│ └─────┘ └─────┘ └─────┘        │
│ Ambient background       (●─)  │
│ Aurora + HUD grid · GPU shader │   subtitle, per design
│   └ [ Aurora | Rays ]          │   ONLY when ambient is ON
│ Power saver                    │
│ [ Off | Calm | Freeze ]        │
│ ┌────────────────────────────┐ │
│ │  ▸ REPLAY BOOT SEQUENCE    │ │
│ └────────────────────────────┘ │
╰────────────────────────────────╯
```

### Why Aurora/Rays is conditional

Not arbitrary progressive disclosure: choosing an ambient *style* is meaningless
while ambient is off. The control is hidden exactly when it has no effect. It is
also the only branching logic in the screen, so it is the piece that earns a
test in both directions.

## Surface: bottom sheet

Replace `AppearanceOverlay`'s absolute-fill `View` with a `BottomSheetModal`,
following the idiom `TradeTicketSheet` already established:

- `@gorhom/bottom-sheet` is **already a dependency**, already used for the rates
  trade ticket.
- `BottomSheetModalProvider` **already wraps the whole app body**
  (`packages/client-react-native/app/(app)/_layout.tsx` — not linked, the `(app)`
  route-group parentheses terminate a markdown link) — deliberately hoisted out
  of the Rates screen, so nothing new is wired.
- Reuse its `backdropComponent` shape (dimmed, press-to-dismiss) and
  `handleIndicatorStyle` (the grab handle the design draws).

`CLOSE ✕` is deleted: the handle, backdrop tap and pan-down give three dismissal
affordances in place of one small target.

**`open` / `onClose` props are preserved.** The visual scenario pins the sheet
open through them ([`tests/visual/scenarios.tsx`](../../../packages/client-react-native/tests/visual/scenarios.tsx)),
and that must keep working.

Sizing: content-height driven with a maximum, scrollable past it. The content is
taller than the design's because of the three extra controls.

## Swatches are derived, not authored

The design's three swatches map onto existing semantic tokens — verified against
the reference shot, where every skin shows *its own accent, then green, then
red*:

| swatch | token |
|---|---|
| 1 | `accentPrimary` (cyan / orange / magenta / blue per skin) |
| 2 | `accentPositive` |
| 3 | `accentNegative` |

Today's chip renders `accentPrimary` + **`accent2`**; the second swatch changes
to `accentPositive` and a third is added. No new colour values are introduced,
so no skin needs hand-tuning and all six stay in sync by construction.

## Data flow — unchanged

All six hooks stay exactly as they are: `useThemePreference` (mode + cycle),
`useThemeSkinPreference`, `useAnimatedBackground`, `usePowerSaver`,
`useAmbientStyle`, `useBootGate` (reboot).

**This is presentation-only.** None of the ~10-site preference blast radius
(4 adapters + contract + presenter + both bindings + ui-contract + fixtures)
applies, because no preference shape changes.

`AppearanceScreen` is rendered by **only** `AppearanceOverlay` — it is not shared
with a settings route — so the change cannot leak beyond this surface.

## Testing

Jest, in `AppearanceScreen.test.tsx` / `AppearanceOverlay.test.tsx`:

1. mode segment selects System / Dark / Light
2. skin card selection drives `setSkin`, and the selected card is marked
3. **Aurora/Rays is absent when ambient is OFF**
4. **Aurora/Rays is present and selectable when ambient is ON**
5. power-saver segment selects Off / Calm / Freeze
6. replay-boot invokes `reboot` and closes the sheet

Every test must be seen to fail before it passes. (3) and (4) are the pair that
matters — they are the only real branch.

## Known consequences

- **`shell/appearance` golden goes stale on merge.** It changes wholesale, and
  re-capture needs a native session (no dev client in DerivedData, no simulator
  booted). This makes **two** knowingly-stale goldens — with `shell/chrome` from
  P8 — which should be cleared together in one device session rather than
  accumulating. Record both so the next capture is not mistaken for a regression.
- **Header width is the one measurement risk.** A 3-way segment beside the title
  on a 402pt screen leaves ~230pt for three cells. Measure it; if it does not sit
  cleanly, mode moves to its own row directly under the header. Do not guess —
  this exact class of assumption is what produced P8.
  - **Resolved: own row, not inline.** The design's real CSS
    (`docs/design/mobile/v1/standalone/Reactive Trader Mobile.html`, the
    "appearance sheet" block) is a genuine measurement, but only for the
    2-way DARK/LIGHT case — it fits inline beside the title at the sheet's
    real content width. That block has no `SYSTEM` button, so it supplies no
    number for the 3-way segment ours needs; estimating a third cell's width
    from font metrics would be exactly the guess this note warns against. The
    segment was moved to its own row beneath the title — safe at any width by
    construction — per the fallback stated above. Landed in
    `AppearanceScreen.tsx` (commit `a4417799a`).
  - **Visible consequence:** a deliberate deviation from the mobile-v1
    reference shot, which shows the segment inline — the sheet is one row
    taller. Worth a look on a future visual-parity pass, and specifically
    *not* a bug to fix back to inline without first obtaining a real 3-way
    measurement.
  - **Reopens if:** a real 3-way-segment measurement is taken (on-device or
    simulator, at the sheet's actual content width), or the design gains a
    `SYSTEM` cell in its own reference, giving a real number to build against.
- `AppearanceScreen` (495 lines) is substantially rewritten, not patched.

## Explicit non-goals

- No change to what any preference *means*, only how it is presented.
- No web/Solid equivalent — this is the RN mobile-v1 surface only.
- Not a power-saver redesign; the ladder is presented as-is.
