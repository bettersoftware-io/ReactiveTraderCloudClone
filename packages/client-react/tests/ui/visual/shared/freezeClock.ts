// Pins the wall clock the visual harness sees, so goldens don't bake in the
// render day. Two live-clock reads leak into visual scenarios:
//   - Tile.tsx's SPT footer: `formatSpotDate(new Date(), SPOT_VALUE_DAYS)`.
//   - BlotterPresenter's Activity-feed row stamp: `formatClockTime(Date.now())`
//     (not currently exercised by any fixture-driven scenario, but frozen too
//     as a safety net — see fixtures.ts's fxActivity, which supplies its own
//     static `time` strings instead of going through the presenter).
// Every committed golden across all three tiers (vitest-browser, playwright-ct,
// plain Playwright) was captured with the tile footer reading "SPT 04 Jul"
// (verified by inspecting the committed PNGs directly). formatSpotDate adds
// SPOT_VALUE_DAYS (2) to `from`, so the instant below is the one that
// reproduces that date — it also matches formatSpotDate.test.ts's own fixture
// (`new Date("2026-07-02T09:00:00Z")`, offsetDays 2 → "04 Jul").
const PINNED_INSTANT = "2026-07-02T09:00:00.000Z";

const pinnedMs = Date.parse(PINNED_INSTANT);

const RealDate: DateConstructor = Date;

// Only the two "what time is it right now" forms — `new Date()` (no args) and
// `Date.now()` — are pinned. `new Date(arg)` is left to the real constructor
// (via `super(...args)`/prototype delegation) so date-string/epoch parsing
// elsewhere in the tree (TileConfirmation's valueDate, blotter columns, the
// RfqCountdown machines' `Date.now() - creationTimestamp` elapsed-time math,
// LiveEventLog's fixture timestamps, etc.) is unaffected. `performance.now()`,
// `setTimeout`, and `requestAnimationFrame` are untouched too — React's
// scheduler reads `performance.now()`, not `Date.now()`, so this pin does not
// interfere with React's own time-slicing.
// A class EXPRESSION (not a top-level class declaration) so this small local
// double doesn't need its own one-class-per-file `FrozenDate.ts` — see
// eslint-rules/class-filename-match.mjs (only flags ClassDeclaration).
// Typed as construct-signature + the one static we define — NOT DateConstructor,
// whose bare-call signature `(): string` a class can never satisfy; the final
// assignment to globalThis.Date carries the cast instead.
interface FrozenDateStatics {
  now(): number;
}

type FrozenDateCtor = (new (...args: unknown[]) => Date) & FrozenDateStatics;

const FrozenDate: FrozenDateCtor = class extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) {
      super(pinnedMs);
    } else {
      // @ts-expect-error - forwarding a variadic constructor tuple to Date
      super(...args);
    }
  }

  static override now(): number {
    return pinnedMs;
  }
};

globalThis.Date = FrozenDate as unknown as DateConstructor;
