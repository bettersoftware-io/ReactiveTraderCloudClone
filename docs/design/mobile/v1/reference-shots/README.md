# Prototype reference shots — a DEVIATION corpus, not a golden set

Screenshots of the frozen mobile-v1 prototype, mirrored against the RN app's own
visual goldens, so *"how far has the app drifted from the design, and where?"* is
answerable **from a phone** — read [DRIFT.md](DRIFT.md).

Before this existed, that question needed a laptop, a booted simulator and a
served prototype, all at once. That is why it only ever got asked at the end of a
phase, on the one machine that could ask it.

**These are not baselines and this is not regression testing.** The prototype
cannot change and cannot break, so there is nothing to regress and a difference
is *never* a failure. A permanently non-zero diff is the expected steady state.

## Three rules

1. **Never a CI gate.** `pnpm check:prototype-shots` asserts only that the
   manifest and this tree agree on which files exist, and that `DRIFT.md`'s
   references resolve. Never add a pixel comparison — it would be either
   permanently red or tolerance-widened until it asserts nothing.
2. **Never auto-updated** — and in particular never "reconciled" by re-shooting
   the prototype to match the app. The gap *is* the artifact; closing it erases
   the entire signal.
3. **Mirror the app's structure and naming.** Same scenario ids, same directory
   shape, so mapping app↔prototype stays mechanical for a human skimming two
   folders and for an LLM asked to compare them.

## What is here

| | |
|---|---|
| 21 stills | 14 paired with an app scenario id, 7 prototype-only |
| 3 filmstrips | `filmstrips/` — one ceremony sampled at several instants |
| [DRIFT.md](DRIFT.md) | generated comparison page, app vs prototype |

Every shot is 1206 × 2622 — the prototype's simulated screen is *exactly* the
iPhone 17 logical viewport (`device-frames.jsx:204`), so at `deviceScaleFactor:
3` the panels are dimension-identical to their app twins and can be overlaid,
not merely set side by side.

**One expected difference that is not drift:** the app captures include the real
iOS status bar and dynamic island; these do not, because the simulated bezel
draws them outside the captured element.

## Regenerating

Deliberately manual, and deliberately two steps — you are expected to look at
the PNGs in between.

```bash
pnpm dev:design:mobile &                                   # serve the prototype
pnpm prototype-shots:capture --out /tmp/proto-scratch      # 21 stills
pnpm prototype-shots:filmstrips --out /tmp/proto-scratch   # 3 ceremonies
pnpm prototype-shots:sheet --out /tmp/proto-scratch        # one image to review
# LOOK at the contact sheet, then promote by COPYING:
cp -R /tmp/proto-scratch/. docs/design/mobile/v1/reference-shots/
pnpm prototype-shots:drift
```

Promote by **copying reviewed bytes**, never by pointing `--out` at this
directory — that commits pixels nobody looked at.

**The review step is not ceremony.** The first full capture produced two shots
that were confidently wrong and passed every check: `lock/hold` had a completely
empty ring (the step pressed the caption, which is a sibling of the button), and
`equities/trade` was actually the Markets tab (`getByText("TRADE")` matched the
"REACTIVE TRADER" wordmark). Both were obvious on the contact sheet and
invisible to everything else, because each shot was internally consistent and
its arrival assertion passed. That is the same reason the app-side golden
session found four defects a diff could never surface: a diff against an
equally-wrong baseline is green.

## Where the pieces live

- Manifest: [`scripts/prototype-shots/shots.ts`](../../../../../scripts/prototype-shots/shots.ts)
- Design: [the spec](../../../../superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md)
- Plan: [the implementation plan](../../../../superpowers/plans/2026-08-02-rn-prototype-deviation-corpus.md)
