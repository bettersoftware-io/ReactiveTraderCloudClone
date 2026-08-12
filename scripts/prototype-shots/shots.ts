// The prototype deviation corpus's single source of truth.
//
// Pure data, Node-safe, no Playwright import — so the consistency gate and the
// DRIFT.md generator can both read it without pulling a browser in. Same split
// as the app side's `tests/visual/scenarioIds.ts` vs `driver.ts`, for the same
// reason recorded in that file's header.
//
// This corpus is NOT a golden set. The prototype is frozen: it cannot change
// and cannot break, so a diff against it is never a failure. See
// docs/superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md §2.

/** One interaction on the way to a shot.
 *
 * The prototype has NO `data-testid` anywhere (verified 2026-08-02: zero
 * occurrences), so steps address elements by visible text or by CSS. Both are
 * legitimate here in a way they would not be in app code, because the prototype
 * is FROZEN — its labels and its runtime-generated class names can never
 * change, so neither locator can rot. */
export type ShotStep =
  /** Click by visible text. `exact` matters more than it looks: the wordmark
   * "REACTIVE TRADER" contains "TRADE", so a substring match for the Equities
   * TRADE tab silently clicks the logo instead — which produced a
   * `equities/trade` shot that was really the Markets tab. */
  | { readonly tapText: string; readonly exact?: boolean }
  | { readonly tapSelector: string }
  /** Press and HOLD without releasing, addressed by selector rather than text:
   * the thing to press is the ring button, not the label beneath it. */
  | { readonly holdSelector: string; readonly ms: number };

/** The radial dock's hex FAB. Addressed by class because its GLYPH is the
 * active module's icon (⇅ on Rates, ◈ on Credit) and becomes ✕ once open — so
 * no text locator survives a screen change. Verified 2026-08-02.
 *
 * Deliberately NOT exported: the capture driver reads `tapSelector` strings off
 * the manifest and never needs the constant, so exporting it would be an unused
 * export (knip catches this). */
const DOCK_FAB = "button.scp4";

/** A spot tile on the Rates grid. Verified: tiles are the only `[data-flip]`
 * elements on that screen. Not exported, for the same reason as DOCK_FAB. */
const SPOT_TILE = "[data-flip]";

/** The hold-to-unlock ring (dc.html:605) — the 112px round button carrying the
 * pointer handlers. The "HOLD TO UNLOCK" caption is a SIBLING div, so pressing
 * the caption does nothing at all.
 *
 * Matched by \ rather than by its inline style: the runtime
 * re-serializes style attributes with spaces (\), so a
 * style-substring selector written from the template source silently matches
 * nothing. Verified unique — it is the only button on the page holding an SVG. */
const UNLOCK_RING = "button:has(svg)";

/** MEASURED, not derived. dc.html:2521 advances holdP by 0.022 per animation
 * frame, which at 60fps would imply ~750ms to fill — but headless Chrome drives
 * rAF faster, and a 420ms hold completed the unlock outright, leaving the lock
 * screen entirely. Sampling the ring's stroke-dashoffset gave 120ms -> 0.33,
 * 160ms -> 0.42, 200ms -> 0.53, 240ms -> 0.64, so ~208ms lands on the 0.55 the
 * app golden pins via LOCK_HOLD_PROGRESS. A partial arc is the entire point of
 * this shot; a full one is a different screen. */
const UNLOCK_HOLD_MS = 208;

/** What proves the shot actually arrived. Always a POSITIVE assertion — never
 * "the launcher isn't showing". See the spec's §7 (T2/T7).
 *
 * Every field set is checked, and at least one must be.
 *
 * Not exported: it is reachable structurally through `Shot["arrival"]`, so an
 * exported alias nothing imports by name would just be dead surface. */
type Arrival = {
  /** Visible DOM text. Unusable for boot shots — the scenes are painted into a
   * canvas, so their names exist only as pixels. */
  readonly text?: string;
  /** A selector that must be present. */
  readonly selector?: string;
  /** A localStorage entry the prototype must have SETTLED ON by itself. For
   * boot this is the real proof of variant: we seed `(N+7)%8` and the prototype
   * writes back `N` (dc.html:1032), so reading `N` back means the intended
   * scene is the one actually drawing. */
  readonly storage?: readonly [key: string, value: string];
};

export type Shot = {
  readonly id: string;
  /** localStorage seeded BEFORE first load. */
  readonly seed: Readonly<Record<string, string>>;
  /** Wait for boot to finish before running `steps`. False only for boot shots,
   * which are captured mid-boot. */
  readonly afterBoot: boolean;
  readonly steps: readonly ShotStep[];
  readonly arrival: Arrival;
  /** True when an app golden of the same id exists to pair against. */
  readonly appTwin: boolean;
  /** Present only for filmstrips: the elapsed seconds to sample, left to right. */
  readonly filmstrip?: readonly number[];
};

const THEME = { rtm_theme: "holo3d", rtm_mode: "dark" } as const;

/** The prototype advances `(stored + 1) % 8` on load (dc.html:1032), so to land
 * on variant N we store N-1. */
function bootSeed(variant: number): Readonly<Record<string, string>> {
  return { ...THEME, rtm_bootSeq: String((variant + 7) % 8) };
}

/** seq → app id, in the prototype's own NAMES order (dc.html:1035):
 * CORE SYNC, UI DRAW-IN, DOCKING CAM, HOLO PROJECTOR, GEO TACTICAL,
 * LAYER COMPOSITOR, SCHEMATIC CORE, VOL TERRAIN.
 *
 * Those names are NOT usable as arrival text — they are painted into the boot
 * canvas, so they exist only as pixels. */
const BOOT_VARIANTS: readonly (readonly [string, number])[] = [
  ["boot/core", 0],
  ["boot/laser", 1],
  ["boot/docking", 2],
  ["boot/hologram", 3],
  ["boot/geo", 4],
  ["boot/layers", 5],
  ["boot/jarvis", 6],
  ["boot/topo", 7],
];

const bootShots: readonly Shot[] = BOOT_VARIANTS.map(([id, seq]) => {
  return {
    id,
    seed: bootSeed(seq),
    afterBoot: false,
    steps: [],
    // Two positive facts: the boot canvas is mounted (so we are not looking at
    // the settled app), and the prototype has settled on the intended variant of
    // the eight (it writes the resolved seq back to localStorage).
    arrival: {
      selector: "[data-boot-canvas]",
      storage: ["rtm_bootSeq", String(seq)] as const,
    },
    appTwin: true,
  };
});

export const SHOTS: readonly Shot[] = [
  ...bootShots,

  // ── paired with an app golden ──────────────────────────────────────────
  {
    id: "blotter/seeded",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "BLOTTER" }],
    arrival: { text: "BLOTTER" },
    appTwin: true,
  },
  {
    id: "analytics/dashboard",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "ANALYTICS" }],
    arrival: { text: "ANALYTICS" },
    appTwin: true,
  },
  {
    id: "credit/rfq-tiles",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }],
    arrival: { text: "RFQS" },
    appTwin: true,
  },
  {
    // Tab labels verified in the running prototype: RFQS / NEW RFQ / SELL-SIDE.
    id: "credit/sell-side",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapSelector: DOCK_FAB },
      { tapText: "CREDIT" },
      { tapText: "SELL-SIDE" },
    ],
    arrival: { text: "YOUR QUOTES" },
    appTwin: true,
  },
  {
    id: "shell/appearance",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapText: "◐" }],
    arrival: { text: "APPEARANCE" },
    appTwin: true,
  },
  {
    id: "lock/hold",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapText: "⌖" },
      { holdSelector: UNLOCK_RING, ms: UNLOCK_HOLD_MS },
    ],
    // "HOLD TO UNLOCK" would be the WRONG assertion — it is the idle caption,
    // present precisely when the hold has NOT engaged. The caption flips to
    // "AUTHENTICATING…" the moment holdP > 0 (dc.html:2600), so this asserts
    // the state we came for rather than the one we are trying to leave.
    arrival: { text: "AUTHENTICATING" },
    appTwin: true,
  },

  // ── prototype-only: surfaces the app has no golden for ─────────────────
  {
    id: "rates/grid",
    seed: THEME,
    afterBoot: true,
    steps: [],
    arrival: { text: "RATES" },
    appTwin: false,
  },
  {
    id: "rates/ticket",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: SPOT_TILE }],
    arrival: { text: "NOTIONAL" },
    appTwin: false,
  },
  {
    id: "equities/markets",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapSelector: DOCK_FAB },
      { tapText: "EQUITIES" },
      { tapText: "MARKETS", exact: true },
    ],
    // Deliberately the tab label here, which would be a weak assertion anywhere
    // else: Markets is the DEFAULT tab, so a click that failed to land still
    // leaves the correct screen. Nothing stronger is needed.
    arrival: { text: "MARKETS" },
    appTwin: false,
  },
  {
    id: "equities/trade",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapSelector: DOCK_FAB },
      { tapText: "EQUITIES" },
      { tapText: "TRADE", exact: true },
    ],
    // Content unique to this tab, not the tab label. "TRADE" is on screen
    // whichever tab is active, so it cannot witness the click landing — and
    // did not: the first capture of this shot was really the Markets tab.
    arrival: { text: "LIMIT PX" },
    appTwin: false,
  },
  {
    id: "equities/blotter",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapSelector: DOCK_FAB },
      { tapText: "EQUITIES" },
      { tapText: "BLOTTER", exact: true },
    ],
    // "ORDERS" rather than "POSITIONS": the Trade tab also lists positions, so
    // only the orders table is unique to the Blotter tab.
    arrival: { text: "ORDERS" },
    appTwin: false,
  },
  {
    id: "credit/new-rfq",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapSelector: DOCK_FAB },
      { tapText: "CREDIT" },
      { tapText: "NEW RFQ" },
    ],
    arrival: { text: "DIRECTION" },
    appTwin: false,
  },
  {
    // The FAB's glyph becomes ✕ once open — that is the arrival proof, and it
    // is unambiguous because ✕ appears nowhere else on the screen.
    id: "shell/dock-open",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }],
    arrival: { text: "✕" },
    appTwin: false,
  },

  // ── prototype-only filmstrips: ceremonies, sampled left to right ───────
  {
    // BUY is the ticket's submit control; the ceremony runs on the tile behind.
    id: "rates/exec-ceremony",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: SPOT_TILE }, { tapText: "BUY" }],
    arrival: { text: "NOTIONAL" },
    appTwin: false,
    filmstrip: [0, 0.35, 0.75, 1.6],
  },
  {
    // Every open RFQ card carries an ACCEPT button; the first is enough.
    id: "credit/accept-ceremony",
    seed: THEME,
    afterBoot: true,
    steps: [
      { tapSelector: DOCK_FAB },
      { tapText: "CREDIT" },
      { tapText: "ACCEPT" },
    ],
    arrival: { text: "RFQS" },
    appTwin: false,
    filmstrip: [0, 0.4, 0.9, 1.8],
  },
  {
    // No interaction: the ring is already counting down on arrival. Samples are
    // spread over 9s so the arc visibly sweeps between panels.
    id: "credit/countdown-ring",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }],
    arrival: { text: "RFQS" },
    appTwin: false,
    filmstrip: [0, 3, 6, 9],
  },
];

/** App scenario ids with NO prototype counterpart. They get a DRIFT.md row and
 * no file. `boot/static` is the app's own no-canvas fallback; the prototype has
 * no connection banner at all — every SIM/LIVE string in the prototype is
 * boot-canvas telemetry (dc.html:1298, :1788, :1861, :2038). */
export const APP_ONLY_IDS: readonly string[] = [
  "boot/static",
  // Captured for Phase 3's shell work and absent here for two months, which is
  // why this list is now cross-checked against the golden tree rather than
  // trusted: a golden nobody declares is invisible in both directions.
  "shell/chrome",
  "shell/connection-banner",
];
