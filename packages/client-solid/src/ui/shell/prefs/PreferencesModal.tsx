import type { Accessor, JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import type { AmbientStyle, PowerSaverLevel } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { PrefSegment, type PrefSegmentOption } from "./PrefSegment";
import { PrefToggle } from "./PrefToggle";
import { useDraggableDialog } from "./useDraggableDialog";

import styles from "./PreferencesModal.module.css";

/**
 * Preferences catalogue modal (prototype Reactive Trader.dc.html:218-716). A
 * two-column DISPLAY / TRADING / NOTIFICATIONS / DATA grid of toggle + segment
 * rows. FOUR rows are wired to real ports — Animated background
 * (`useAnimatedBackground`), Power saver (`usePowerSaver`, a 3-state
 * Off/Calm/Freeze segment), Ambient style (`useAmbientStyle`), and Always
 * play boot animation (`useForceBootAnimation`); every other row is
 * decorative (see the comment on the catalogue above). Dumb component:
 * consumes `useViewModel()` destructured only, holds no app-layer state /
 * persistence / transport / timers, and renders only when `open`.
 */
export function PreferencesModal(props: PreferencesModalProps): JSX.Element {
  const {
    useAnimatedBackground,
    usePowerSaver,
    useAmbientStyle,
    useForceBootAnimation,
  } = useViewModel();


  const { enabled: animatedBg, toggle: toggleAnimatedBg } =
    useAnimatedBackground();

  const { level: powerSaverLevel, setLevel: setPowerSaverLevel } =
    usePowerSaver();
  const { style: ambientStyle, setStyle: setAmbientStyle } = useAmbientStyle();

  const { enabled: forceBootAnimation, toggle: toggleForceBootAnimation } =
    useForceBootAnimation();

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
                DISPLAY · TRADING · NOTIFICATIONS · DATA
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
              <div class={styles.column}>
                <div class={styles.sectionHead}>DISPLAY</div>
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
                <PrefToggle
                  label="Always play boot animation"
                  description="Plays the startup animation even when your system asks for reduced motion (e.g. remote desktops / VDI)."
                  on={forceBootAnimation()}
                  onToggle={toggleForceBootAnimation}
                  testid="pref-toggle-forceBootAnimation"
                />
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
              </div>

              <div class={styles.column}>
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

const POWER_SAVER_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "off", label: "Off" },
  { value: "calm", label: "Calm" },
  { value: "freeze", label: "Freeze" },
];

// DECORATIVE — cosmetic HUD setting, intentionally not wired to any port (spec:
// decorative-but-dead is allowed and explicit). The REAL controls in this
// modal are the Animated-background toggle (useAnimatedBackground), Power
// saver toggle (usePowerSaver), and Ambient style segment (useAmbientStyle);
// the rows below hold throwaway local state purely so the switches/segments
// respond to clicks for the golden + contract tiers.
const DISPLAY_TOGGLES: readonly ToggleDef[] = [
  {
    key: "reduceMotion",
    label: "Reduce motion",
    description: "Disable all ambient animation.",
  },
  {
    key: "glassBlur",
    label: "Glass blur panels",
    description: "Frosted panel backdrop.",
  },
  { key: "showGrid", label: "Background grid" },
  { key: "scanlines", label: "Scanline overlay" },
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
