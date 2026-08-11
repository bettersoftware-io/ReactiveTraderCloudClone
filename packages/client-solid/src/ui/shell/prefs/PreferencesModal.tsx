import type { Accessor, JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";

import { formatGateResetTime, type JarvisState } from "@rtc/client-core";
import type {
  AmbientStyle,
  ChartSubstrate,
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  LoginWaitDelay,
  LoginWaitStyle,
  PowerSaverLevel,
} from "@rtc/domain";
import {
  JARVIS_BRAIN_LABELS,
  JARVIS_BRAINS,
  JARVIS_EFFORTS,
  JARVIS_NARRATOR_PREFERENCES,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { PrefAction } from "./PrefAction";
import { PrefSegment, type PrefSegmentOption } from "./PrefSegment";
import { PrefToggle } from "./PrefToggle";
import { useDraggableDialog } from "./useDraggableDialog";

import styles from "./PreferencesModal.module.css";

/**
 * Preferences catalogue modal (prototype Reactive Trader.dc.html:218-716). A
 * two-column DISPLAY / MOTION | TRADING / NOTIFICATIONS / DATA / JARVIS grid
 * of toggle + segment rows.
 *
 * The columns are loosely balanced by ROW COUNT — column 1 (DISPLAY/MOTION)
 * holds 14 rows, column 2 (TRADING/NOTIFICATIONS/DATA & PRIVACY/JARVIS) 17
 * (measured directly against this file's rendered rows, counting the new
 * "Reset workspace layout" row below; the un-counted Brain-row gate hint
 * is conditional decoration, not a row). MOTION exists because DISPLAY had
 * grown to hold every movement-related control and left the grid lopsided
 * 15/9 — splitting "how it looks" from "how it moves" rebalanced it at the
 * time. The JARVIS section (added later) and this Reset row both landed at
 * the foot/tail of column 2 without reopening that original rebalance, so
 * the two columns have drifted apart again since; treat the counts above as
 * a snapshot, not an invariant to re-defend on every future row.
 *
 * ELEVEN rows are wired to real ports — Animated background
 * (`useAnimatedBackground`), Power saver (`usePowerSaver`, a 3-state
 * Off/Calm/Freeze segment), Ambient style (`useAmbientStyle`), Chart renderer
 * (`useChartSubstrate`), Always play boot animation
 * (`useForceBootAnimation`), the two login-wait rows
 * (`useLoginWaitPreferences`), the three Jarvis rows (`useJarvisPreferences`
 * for the stored brain/effort/narrator, `useJarvis` read-only for which
 * brains the server is currently offering), and Reset workspace layout
 * (`useWorkspaceReset`); every other row is decorative (see the comment on
 * the catalogue below). Dumb component: consumes `useViewModel()`
 * destructured only, holds no app-layer state / persistence / transport /
 * timers, and renders only when `open`.
 */
export function PreferencesModal(props: PreferencesModalProps): JSX.Element {
  const {
    useAnimatedBackground,
    usePowerSaver,
    useAmbientStyle,
    useChartSubstrate,
    useForceBootAnimation,
    useLoginWaitPreferences,
    useJarvis,
    useJarvisPreferences,
    useWorkspaceReset,
  } = useViewModel();

  const resetWorkspaceLayout = useWorkspaceReset();

  const { enabled: animatedBg, toggle: toggleAnimatedBg } =
    useAnimatedBackground();

  const { level: powerSaverLevel, setLevel: setPowerSaverLevel } =
    usePowerSaver();
  const { style: ambientStyle, setStyle: setAmbientStyle } = useAmbientStyle();
  const { substrate: chartSubstrate, setSubstrate: setChartSubstrate } =
    useChartSubstrate();

  const { enabled: forceBootAnimation, toggle: toggleForceBootAnimation } =
    useForceBootAnimation();

  const {
    style: loginWaitStyle,
    setStyle: setLoginWaitStyle,
    delay: loginWaitDelay,
    setDelay: setLoginWaitDelay,
  } = useLoginWaitPreferences();

  const { state: jarvisState } = useJarvis();
  const {
    brain: jarvisBrain,
    setBrain: setJarvisBrain,
    effort: jarvisEffort,
    setEffort: setJarvisEffort,
    narrator: jarvisNarrator,
    setNarrator: setJarvisNarrator,
  } = useJarvisPreferences();

  // The active usage-budget gate (null when none is active). A gated brain
  // gets both `disabled: true` and a `title` explaining why — the reset
  // time, formatted by the same helper the hint line below uses — so the
  // native tooltip and the hint line never drift apart.
  function gate(): JarvisState["gate"] {
    return jarvisState().gate;
  }

  // A createMemo (not a plain function called only from guarded sites)
  // — mirrors react's eager `const gateHint = gate === null ? … : …`
  // shape: it re-evaluates on every `gate()` change regardless of whether
  // anything currently reads it, so BOTH ternary arms are real reachable
  // code (a component mounted with a null gate exercises the `undefined`
  // arm on creation), not a permanently-dead branch behind the two guarded
  // call sites below.
  const gateHint = createMemo((): string | undefined => {
    const g = gate();
    return g === null
      ? undefined
      : `Budget window — resets ${formatGateResetTime(g.resetsAtMs)}`;
  });

  // Real (non-"scripted") brain options are disabled when the server isn't
  // currently offering them (jarvisState().brains — an empty array is a
  // normal "nothing offered right now" value, not a loading sentinel, so it
  // disables every real option same as any other not-offered case).
  // "scripted" is always selectable — it's the offline fallback, not a
  // server-side model.
  // A brain the active gate has removed is ALSO disabled, independent of
  // whether the server still offers it in `brains` (a gate can remove a
  // brain the picker would otherwise show as available).
  function jarvisBrainOptions(): readonly PrefSegmentOption[] {
    const g = gate();
    return JARVIS_BRAINS.map((brain): PrefSegmentOption => {
      const gated = g?.gated.includes(brain) ?? false;
      return {
        value: brain,
        label: JARVIS_BRAIN_LABELS[brain],
        disabled:
          gated ||
          (brain !== "scripted" && !jarvisState().brains.includes(brain)),
        title: gated ? gateHint() : undefined,
      };
    });
  }

  const [toggles, setToggles] =
    createSignal<Record<string, boolean>>(INITIAL_TOGGLES);

  const [segments, setSegments] =
    createSignal<Record<string, string>>(INITIAL_SEGMENTS);

  const { dialogRef, headerProps, dialogStyle } = useDraggableDialog({
    open: () => {
      return props.open;
    },
  });

  function toggleCosmetic(key: string): void {
    setToggles((prev) => {
      return { ...prev, [key]: !prev[key] };
    });
  }

  function selectSegment(group: string, value: string): void {
    setSegments((prev) => {
      return { ...prev, [group]: value };
    });
  }

  return (
    <Show when={props.open}>
      <div data-testid="prefs-modal" class={styles.overlay}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Preferences"
          class={styles.dialog}
          style={dialogStyle()}
        >
          <header class={styles.head} {...headerProps}>
            <div>
              <div class={styles.title}>PREFERENCES</div>
              <div class={styles.subtitle}>
                DISPLAY · MOTION · JARVIS · TRADING · NOTIFICATIONS · DATA
              </div>
            </div>
            <button
              type="button"
              data-testid="prefs-close"
              data-nodrag=""
              aria-label="Close preferences"
              class={styles.closeButton}
              onClick={() => {
                props.onClose();
              }}
            >
              ✕
            </button>
          </header>

          <div class={styles.body}>
            <div class={styles.grid}>
              <div data-testid="prefs-column" class={styles.column}>
                <div class={styles.sectionHead}>DISPLAY</div>
                <ToggleGroup
                  defs={DISPLAY_TOGGLES}
                  values={toggles}
                  onToggle={toggleCosmetic}
                />
                <SegmentGroup
                  defs={DISPLAY_SEGMENTS}
                  values={segments}
                  onSelect={selectSegment}
                />

                <div class={styles.sectionHead}>MOTION</div>
                <PrefSegment
                  label="Power saver"
                  options={POWER_SAVER_OPTIONS}
                  value={powerSaverLevel()}
                  onChange={(value: string) => {
                    setPowerSaverLevel(value as PowerSaverLevel);
                  }}
                  testid="pref-segment-powerSaver"
                />
                <PrefToggle
                  label="Animated background"
                  description="Drifting aurora & grid. Static is lighter on CPU/GPU."
                  on={animatedBg()}
                  onToggle={toggleAnimatedBg}
                  testid="pref-toggle-animatedBg"
                />
                <PrefSegment
                  label="Ambient style"
                  description="Northern-lights curtains or the original accent rays."
                  options={AMBIENT_STYLE_OPTIONS}
                  value={ambientStyle()}
                  onChange={(value: string) => {
                    setAmbientStyle(value as AmbientStyle);
                  }}
                  testid="pref-segment-ambientStyle"
                />
                <PrefSegment
                  label="Chart renderer"
                  description="Retained DOM/SVG geometry, or immediate-mode canvas (fewer live DOM nodes)."
                  options={CHART_SUBSTRATE_OPTIONS}
                  value={chartSubstrate()}
                  onChange={(value: string) => {
                    setChartSubstrate(value as ChartSubstrate);
                  }}
                  testid="pref-segment-chartSubstrate"
                />
                <ToggleGroup
                  defs={MOTION_TOGGLES}
                  values={toggles}
                  onToggle={toggleCosmetic}
                />
                <PrefToggle
                  label="Always play boot animation"
                  description="Plays the startup animation even when your system asks for reduced motion (e.g. remote desktops / VDI)."
                  on={forceBootAnimation()}
                  onToggle={toggleForceBootAnimation}
                  testid="pref-toggle-forceBootAnimation"
                />
                <PrefSegment
                  label="Login wait style"
                  options={LOGIN_WAIT_STYLE_OPTIONS}
                  value={loginWaitStyle()}
                  onChange={(value: string) => {
                    setLoginWaitStyle(value as LoginWaitStyle);
                  }}
                  testid="pref-segment-loginWaitStyle"
                />
                <PrefSegment
                  label="Login wait delay"
                  description="Holds sign-in back so the wait animation is visible."
                  options={LOGIN_WAIT_DELAY_OPTIONS}
                  value={loginWaitDelay()}
                  onChange={(value: string) => {
                    setLoginWaitDelay(value as LoginWaitDelay);
                  }}
                  testid="pref-segment-loginWaitDelay"
                />
              </div>

              <div data-testid="prefs-column" class={styles.column}>
                <div class={styles.sectionHead}>TRADING</div>
                <ToggleGroup
                  defs={TRADING_TOGGLES}
                  values={toggles}
                  onToggle={toggleCosmetic}
                />
                <SegmentGroup
                  defs={TRADING_SEGMENTS}
                  values={segments}
                  onSelect={selectSegment}
                />

                <div class={styles.sectionHead}>NOTIFICATIONS</div>
                <ToggleGroup
                  defs={NOTIFICATION_TOGGLES}
                  values={toggles}
                  onToggle={toggleCosmetic}
                />

                <div class={styles.sectionHead}>DATA &amp; PRIVACY</div>
                <SegmentGroup
                  defs={DATA_SEGMENTS}
                  values={segments}
                  onSelect={selectSegment}
                />
                <ToggleGroup
                  defs={DATA_TOGGLES}
                  values={toggles}
                  onToggle={toggleCosmetic}
                />
                <PrefAction
                  label="Reset workspace layout"
                  description="Restores every tab's default panel arrangement and unpins every docked desk panel."
                  buttonLabel="RESET"
                  testid="pref-reset-workspace-layout"
                  onPress={resetWorkspaceLayout}
                />

                <div class={styles.sectionHead}>JARVIS</div>
                <PrefSegment
                  label="Brain"
                  description="Which AI powers the desk assistant."
                  options={jarvisBrainOptions()}
                  value={jarvisBrain()}
                  onChange={(value: string) => {
                    setJarvisBrain(value as JarvisBrain);
                  }}
                  testid="pref-segment-jarvisBrain"
                />
                <Show when={gate() !== null}>
                  <div
                    class={styles.gateHint}
                    data-testid="pref-segment-jarvisBrain-hint"
                  >
                    {gateHint()}
                  </div>
                </Show>
                <PrefSegment
                  label="Effort"
                  description="Thinking-effort budget for a live brain. No effect on scripted."
                  options={JARVIS_EFFORT_OPTIONS}
                  value={jarvisEffort()}
                  onChange={(value: string) => {
                    setJarvisEffort(value as JarvisEffort);
                  }}
                  testid="pref-segment-jarvisEffort"
                  disabled={jarvisBrain() === "scripted"}
                />
                <PrefSegment
                  label="Narrator"
                  description="Let J.A.R.V.I.S speak up unprompted about notable market moves."
                  options={JARVIS_NARRATOR_OPTIONS}
                  value={jarvisNarrator()}
                  onChange={(value: string) => {
                    setJarvisNarrator(value as JarvisNarratorPreference);
                  }}
                  testid="pref-segment-jarvisNarrator"
                />
              </div>
            </div>
          </div>

          <footer class={styles.foot}>
            <span class={styles.footNote}>
              ⚡ Static background recommended — lowest GPU load
            </span>
            <button
              type="button"
              data-testid="prefs-done"
              class={styles.doneButton}
              onClick={() => {
                props.onClose();
              }}
            >
              DONE
            </button>
          </footer>
        </div>
      </div>
    </Show>
  );
}

/** A run of cosmetic PrefToggle rows driven by one defs catalogue — the state
 * lookup and handler binding live here so the call sites stay declarative. */
function ToggleGroup(props: ToggleGroupProps): JSX.Element {
  return (
    <For each={props.defs}>
      {(def: ToggleDef) => {
        return (
          <PrefToggle
            label={def.label}
            description={def.description}
            on={props.values()[def.key]}
            onToggle={() => {
              props.onToggle(def.key);
            }}
            testid={`pref-toggle-${def.key}`}
          />
        );
      }}
    </For>
  );
}

/** A run of cosmetic PrefSegment rows driven by one defs catalogue. */
function SegmentGroup(props: SegmentGroupProps): JSX.Element {
  return (
    <For each={props.defs}>
      {(def: SegmentDef) => {
        return (
          <PrefSegment
            label={def.label}
            options={def.options}
            value={props.values()[def.key]}
            onChange={(value: string) => {
              props.onSelect(def.key, value);
            }}
            testid={`pref-segment-${def.key}`}
          />
        );
      }}
    </For>
  );
}

interface PreferencesModalProps {
  /** The modal renders only when `open` is true. */
  open: boolean;
  /** Fired when the modal is dismissed (✕ or DONE). */
  onClose: () => void;
}

interface ToggleGroupProps {
  defs: readonly ToggleDef[];
  values: Accessor<Record<string, boolean>>;
  onToggle: (key: string) => void;
}

interface SegmentGroupProps {
  defs: readonly SegmentDef[];
  values: Accessor<Record<string, string>>;
  onSelect: (group: string, value: string) => void;
}

interface ToggleDef {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

interface SegmentDef {
  readonly key: string;
  readonly label: string;
  readonly options: readonly PrefSegmentOption[];
}

// The options for the real "Ambient style" segment row, wired to
// useAmbientStyle (not decorative — see PrefSegment call site above).
const AMBIENT_STYLE_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "aurora", label: "Aurora" },
  { value: "rays", label: "Rays" },
];

// The options for the real "Chart renderer" segment row, wired to
// useChartSubstrate (not decorative — see PrefSegment call site above).
const CHART_SUBSTRATE_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "dom", label: "DOM" },
  { value: "canvas", label: "Canvas" },
];

// Options for the two real login-wait rows (useLoginWaitPreferences). "Auto"
// is the shipping behaviour — alternate the treatment per attempt.
const LOGIN_WAIT_STYLE_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "auto", label: "Auto" },
  { value: "handshake", label: "Handshake" },
  { value: "reactor", label: "Reactor" },
];

const LOGIN_WAIT_DELAY_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "off", label: "Off" },
  { value: "1s", label: "1s" },
  { value: "3s", label: "3s" },
  { value: "6s", label: "6s" },
];

const POWER_SAVER_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "off", label: "Off" },
  { value: "calm", label: "Calm" },
  { value: "freeze", label: "Freeze" },
];

// Options for the real "Effort" row (useJarvisPreferences). Labels are
// JARVIS_EFFORTS title-cased; the brain row's options are built inside the
// component (per-option `disabled` depends on live jarvisState().brains).
const JARVIS_EFFORT_OPTIONS: readonly PrefSegmentOption[] = JARVIS_EFFORTS.map(
  (effort): PrefSegmentOption => {
    return {
      value: effort,
      label: effort.charAt(0).toUpperCase() + effort.slice(1),
    };
  },
);

// Options for the real "Narrator" row (useJarvisPreferences) — mirrors the
// Brain/Effort rows' structure immediately above.
const JARVIS_NARRATOR_OPTIONS: readonly PrefSegmentOption[] =
  JARVIS_NARRATOR_PREFERENCES.map((preference): PrefSegmentOption => {
    return {
      value: preference,
      label: preference === "on" ? "On" : "Off",
    };
  });

// DECORATIVE — cosmetic HUD setting, intentionally not wired to any port (spec:
// decorative-but-dead is allowed and explicit). The REAL controls in this
// modal are the Animated-background toggle (useAnimatedBackground), Power
// saver toggle (usePowerSaver), and Ambient style segment (useAmbientStyle);
// the rows below hold throwaway local state purely so the switches/segments
// respond to clicks for the golden + contract tiers.
const DISPLAY_TOGGLES: readonly ToggleDef[] = [
  {
    key: "glassBlur",
    label: "Glass blur panels",
    description: "Frosted panel backdrop.",
  },
  { key: "showGrid", label: "Background grid" },
  { key: "scanlines", label: "Scanline overlay" },
];

const MOTION_TOGGLES: readonly ToggleDef[] = [
  {
    key: "reduceMotion",
    label: "Reduce motion",
    description: "Disable all ambient animation.",
  },
];

const TRADING_TOGGLES: readonly ToggleDef[] = [
  {
    key: "oneClick",
    label: "One-click trading",
    description: "Execute without confirmation.",
  },
  { key: "confirmExec", label: "Confirm before execute" },
  { key: "execSound", label: "Execution sound" },
];

const NOTIFICATION_TOGGLES: readonly ToggleDef[] = [
  {
    key: "desktopAlerts",
    label: "Desktop alerts",
    description: "Trade fills & rejections.",
  },
  { key: "priceAlerts", label: "Price alerts" },
  { key: "marketNews", label: "Market news feed" },
];

const DATA_TOGGLES: readonly ToggleDef[] = [
  {
    key: "heartbeat",
    label: "Connection heartbeat",
    description: "Keep-alive ping to gateway.",
  },
  { key: "telemetry", label: "Anonymous telemetry" },
  { key: "crashReports", label: "Crash reports" },
  {
    key: "betaModules",
    label: "Beta modules",
    description: "Early-access trading tools.",
  },
];

const DISPLAY_SEGMENTS: readonly SegmentDef[] = [
  {
    key: "density",
    label: "Density",
    options: [
      { value: "compact", label: "Compact" },
      { value: "comfortable", label: "Comfortable" },
    ],
  },
  {
    key: "font",
    label: "Display font",
    options: [
      { value: "orbitron", label: "Orbitron" },
      { value: "inter", label: "Inter" },
      { value: "mono", label: "Mono" },
    ],
  },
  {
    key: "scale",
    label: "Interface scale",
    options: [
      { value: "80", label: "80%" },
      { value: "100", label: "100%" },
      { value: "120", label: "120%" },
    ],
  },
];

const TRADING_SEGMENTS: readonly SegmentDef[] = [
  {
    key: "precision",
    label: "Price precision",
    options: [
      { value: "auto", label: "Auto" },
      { value: "standard", label: "Standard" },
      { value: "fractional", label: "Fractional" },
    ],
  },
];

const DATA_SEGMENTS: readonly SegmentDef[] = [
  {
    key: "refresh",
    label: "Live refresh rate",
    options: [
      { value: "realtime", label: "Realtime" },
      { value: "fast", label: "Fast" },
      { value: "normal", label: "Normal" },
      { value: "slow", label: "Slow" },
    ],
  },
  {
    key: "tz",
    label: "Time zone",
    options: [
      { value: "utc", label: "UTC" },
      { value: "lon", label: "LON" },
      { value: "nyc", label: "NYC" },
      { value: "tko", label: "TKO" },
    ],
  },
];

const INITIAL_TOGGLES: Record<string, boolean> = {
  reduceMotion: false,
  glassBlur: true,
  showGrid: true,
  scanlines: false,
  oneClick: false,
  confirmExec: true,
  execSound: true,
  desktopAlerts: true,
  priceAlerts: false,
  marketNews: true,
  heartbeat: true,
  telemetry: false,
  crashReports: true,
  betaModules: false,
};

const INITIAL_SEGMENTS: Record<string, string> = {
  density: "comfortable",
  font: "orbitron",
  scale: "100",
  precision: "standard",
  refresh: "realtime",
  tz: "utc",
};
