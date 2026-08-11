import {
  JARVIS_DEMO_STEPS,
  type JarvisDemoState,
  type JarvisDriverState,
  type JarvisState,
  type LayoutIntents,
  type LayoutState,
  type ThroughputView,
  type WorkspaceNavIntents,
  type WorkspaceNavState,
  type WorkspaceTab,
} from "@rtc/client-core";
import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_JARVIS_SKIN,
  type LogEvent,
  type MetricSample,
  type SessionInfo,
} from "@rtc/domain";
import type {
  UseJarvisDemoResult,
  UseJarvisPanelsResult,
  UseJarvisPreferencesResult,
  UseJarvisResult,
} from "@rtc/react-bindings";

import type { InertSlice } from "./sliceTypes";

function noop(): void {}

/**
 * `useMetrics`'s own return shape. No exported name exists for it
 * (`MetricsView` is a module-private interface inside `createViewModel.ts`)
 * — restated here so `METRICS_VIEW` below can carry an explicit type.
 */
interface MetricsResult {
  throughput: readonly MetricSample[];
  latency: readonly MetricSample[];
  errorRate: readonly MetricSample[];
}

/** `useLayout`'s own return shape (state + `LayoutIntents`) — not exported
 * under its own name by `@rtc/react-bindings`, so restated here from its
 * two exported halves (`LayoutState`, `LayoutIntents`). */
type LayoutResult = { state: LayoutState } & LayoutIntents;

/** `useWorkspaceNav`'s own return shape — same restatement as
 * `LayoutResult` above, from its two exported halves. */
type WorkspaceNavResult = { state: WorkspaceNavState } & WorkspaceNavIntents;

/** `useThroughput`'s own return shape (`ThroughputView` plus the `setValue`
 * intent createViewModel adds on top of it) — same restatement pattern. */
type ThroughputResult = ThroughputView & { setValue: (value: number) => void };

/**
 * The 16 `ViewModel` hooks no React Native surface reads today (see
 * `sliceTypes.ts`'s `InertSlice` doc). Every value below is the emptiest
 * thing its own type admits — no fixtures, no fabricated data — because the
 * only job this slice does is let `buildFakeViewModel` (the composed
 * object) type-check as a complete `ViewModel` with no cast.
 *
 * Every nested value is a frozen module-level constant (declared below the
 * export, referenced from it), never built fresh inside a hook body, so
 * `toBe` identity holds across calls and across composed-fake instances —
 * see the shared brief's "Every hook returns the same value on every call"
 * constraint.
 */
export const inertSlice: InertSlice = {
  useAnimationIntents: (_target: string) => {
    return null;
  },
  useEventLog: () => {
    return EMPTY_EVENT_LOG;
  },
  useJarvis: () => {
    return JARVIS_RESULT;
  },
  useJarvisDemo: () => {
    return JARVIS_DEMO_RESULT;
  },
  useJarvisDriver: () => {
    return JARVIS_DRIVER_STATE;
  },
  useJarvisPanelData: (_panelId: string) => {
    return null;
  },
  useJarvisPanels: () => {
    return JARVIS_PANELS_RESULT;
  },
  useJarvisPreferences: () => {
    return JARVIS_PREFERENCES_RESULT;
  },
  useJarvisUsage: () => {
    return null;
  },
  useLayout: (_tab: WorkspaceTab) => {
    return LAYOUT_RESULT;
  },
  useMetrics: () => {
    return METRICS_VIEW;
  },
  useSessionCountSeries: () => {
    return EMPTY_SESSION_COUNT_SERIES;
  },
  useSessions: () => {
    return EMPTY_SESSIONS;
  },
  useThroughput: () => {
    return THROUGHPUT_RESULT;
  },
  useTopology: () => {
    return null;
  },
  useWorkspaceNav: () => {
    return WORKSPACE_NAV_RESULT;
  },
};

/** Newest-first rolling event log — starts empty in the real presenter too
 * (`useEventLogValue`'s own bind default), so empty is not a degraded stand-
 * in here, it is the resting value. */
const EMPTY_EVENT_LOG: readonly LogEvent[] = [];

/** Rolling session-count series for the Admin "Active Sessions" KPI card —
 * starts empty, mirroring `useMetrics`'s three series below in shape. */
const EMPTY_SESSION_COUNT_SERIES: readonly MetricSample[] = [];

/** Active trader sessions — starts empty. */
const EMPTY_SESSIONS: readonly SessionInfo[] = [];

/** `useMetrics`'s three rolling chart series — throughput/latency/error-rate
 * windows, all starting empty (mirrors `useThroughputSamples`/
 * `useLatencySamples`/`useErrorRateSamples`'s own bind defaults). No
 * exported name for this shape exists — see `MetricsResult` above. */
const METRICS_VIEW: MetricsResult = {
  throughput: [],
  latency: [],
  errorRate: [],
};

/** Resting `JarvisState` — closed, idle, no transcript, no brains on offer,
 * unavailable (the emptiest boolean, not the sim-mode-default `true`: no RN
 * surface reads this today, so there is no scenario this needs to look
 * "live" for). `skin`/`effectiveBrain` have no empty member in their own
 * union, so each takes its domain-defined DEFAULT_* constant — the closest
 * thing to a resting arm a closed enum admits. */
const JARVIS_STATE: JarvisState = {
  open: false,
  skin: DEFAULT_JARVIS_SKIN,
  unread: 0,
  unreadNarration: false,
  phase: "idle",
  entries: [],
  pendingConfirmation: null,
  available: false,
  brains: [],
  effectiveBrain: DEFAULT_JARVIS_BRAIN,
  gate: null,
  openCount: 0,
};

/** `useJarvis()`'s resting result — state above, every intent a no-op. */
const JARVIS_RESULT: UseJarvisResult = {
  state: JARVIS_STATE,
  open: noop,
  close: noop,
  toggle: noop,
  send: noop,
  narrate: noop,
  sendScripted: noop,
  approveConfirmation: noop,
  declineConfirmation: noop,
  setSkin: noop,
};

/** Resting `JarvisDemoState` — matches `JarvisDemoMachine`'s own idle
 * `INITIAL` shape (`running: false`, `stepIndex: 0`, `label: null`).
 * `stepCount` is not a fixture value — it is read from the same
 * `JARVIS_DEMO_STEPS.length` the real machine derives it from, so a future
 * step added/removed there cannot silently desync this constant. */
const JARVIS_DEMO_STATE: JarvisDemoState = {
  running: false,
  stepIndex: 0,
  stepCount: JARVIS_DEMO_STEPS.length,
  label: null,
};

/** `useJarvisDemo()`'s resting result — state above, both intents no-ops. */
const JARVIS_DEMO_RESULT: UseJarvisDemoResult = {
  state: JARVIS_DEMO_STATE,
  startDemo: noop,
  stopDemo: noop,
};

/** `useJarvisDriver()`'s resting result — matches `JarvisDriverMachine`'s
 * own idle state (`{ lastBatch: [] }`), no drive batch ever applied. */
const JARVIS_DRIVER_STATE: JarvisDriverState = { lastBatch: [] };

/** `useJarvisPreferences()`'s resting result — the STORED preference has no
 * empty member of its own closed union, so each field takes its domain
 * DEFAULT_* constant (the same ones `createViewModel`'s own binds default
 * to); every setter is a no-op. */
const JARVIS_PREFERENCES_RESULT: UseJarvisPreferencesResult = {
  brain: DEFAULT_JARVIS_BRAIN,
  setBrain: noop,
  effort: DEFAULT_JARVIS_EFFORT,
  setEffort: noop,
  narrator: DEFAULT_JARVIS_NARRATOR,
  setNarrator: noop,
};

/** No generative-UI desk panels ever spawned — the real presenter starts
 * empty too (`useJarvisPanelsValue`'s own bind default). An empty list is
 * simpler than constructing a panel just to exercise its `data$: EMPTY`
 * field, and is preferable per the shared brief. */
const JARVIS_PANELS_RESULT: UseJarvisPanelsResult = {
  panels: [],
  dismissPanel: noop,
};

/** The emptiest `LayoutState` its own type admits: a single unnamed panel
 * leaf (no split tree to walk), nothing maximized, nothing collapsed. */
const EMPTY_LAYOUT_STATE: LayoutState = {
  root: { kind: "panel", panelId: "" },
  maximized: null,
  collapsed: [],
};

/** `useLayout()`'s resting result — same value regardless of which
 * `WorkspaceTab` is requested (no RN surface reads this hook today, so
 * there is no per-tab scenario to differentiate); every intent a no-op. */
const LAYOUT_RESULT: LayoutResult = {
  state: EMPTY_LAYOUT_STATE,
  maximize: noop,
  restore: noop,
  collapse: noop,
  expand: noop,
  resize: noop,
};

/**
 * `useWorkspaceNav()`'s resting result. UNLIKE the web sibling
 * (`buildFakeViewModel.ts`), this is a plain frozen constant, not a
 * `useState` — the web fake's "app/equities" visual scenario clicks a nav
 * tab and relies on `switchTab` re-rendering `App` with the new tab, but no
 * RN scenario navigates: every RN scenario mounts a module's content
 * directly. A stateful hook here would be the one live thing in an
 * otherwise fully static fake, and nothing in this package exercises it.
 */
const WORKSPACE_NAV_RESULT: WorkspaceNavResult = {
  state: { activeTab: "fx" },
  switchTab: noop,
};

/** `useThroughput()`'s resting result — `value`/`loading` take the
 * emptiest literal their own type admits (`0`/`false`, not the real
 * presenter's `loading: true` startup default: no RN surface reads this
 * hook today, so there is no "still loading" scenario to preserve).
 * `setValue` is a no-op. */
const THROUGHPUT_RESULT: ThroughputResult = {
  value: 0,
  loading: false,
  message: null,
  setValue: noop,
};
