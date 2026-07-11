import { type ReactElement, useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { PrefSegment, type PrefSegmentOption } from "./PrefSegment";
import { PrefToggle } from "./PrefToggle";

import styles from "./PreferencesModal.module.css";

/**
 * Preferences catalogue modal (prototype Reactive Trader.dc.html:218-716). A
 * two-column DISPLAY / TRADING / NOTIFICATIONS / DATA grid of toggle + segment
 * rows. Only the Animated-background toggle is wired to a real port
 * (`useAnimatedBackground`); every other row is decorative (see the comment on
 * the catalogue above). Dumb component: consumes `useViewModel()` destructured only,
 * holds no app-layer state / persistence / transport / timers, and renders only
 * when `open`.
 */
export function PreferencesModal({
  open,
  onClose,
}: PreferencesModalProps): ReactElement | null {
  const { useAnimatedBackground } = useViewModel();
  const { enabled: animatedBg, toggle: toggleAnimatedBg } =
    useAnimatedBackground();

  const [toggles, setToggles] =
    useState<Record<string, boolean>>(INITIAL_TOGGLES);
  const [segments, setSegments] =
    useState<Record<string, string>>(INITIAL_SEGMENTS);

  if (!open) {
    return null;
  }

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
    <div data-testid="prefs-modal" className={styles.overlay}>
      <div role="dialog" aria-label="Preferences" className={styles.dialog}>
        <header className={styles.head}>
          <div>
            <div className={styles.title}>PREFERENCES</div>
            <div className={styles.subtitle}>
              DISPLAY · TRADING · NOTIFICATIONS · DATA
            </div>
          </div>
          <button
            type="button"
            data-testid="prefs-close"
            aria-label="Close preferences"
            className={styles.closeButton}
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.grid}>
            <div className={styles.column}>
              <div className={styles.sectionHead}>DISPLAY</div>
              <PrefToggle
                label="Animated background"
                description="Drifting aurora & grid. Static is lighter on CPU/GPU."
                on={animatedBg}
                onToggle={toggleAnimatedBg}
                testid="pref-toggle-animatedBg"
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

              <div className={styles.sectionHead}>TRADING</div>
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

            <div className={styles.column}>
              <div className={styles.sectionHead}>NOTIFICATIONS</div>
              <ToggleGroup
                defs={NOTIFICATION_TOGGLES}
                values={toggles}
                onToggle={toggleCosmetic}
              />

              <div className={styles.sectionHead}>DATA &amp; PRIVACY</div>
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

        <footer className={styles.foot}>
          <span className={styles.footNote}>
            ⚡ Static background recommended — lowest GPU load
          </span>
          <button
            type="button"
            data-testid="prefs-done"
            className={styles.doneButton}
            onClick={onClose}
          >
            DONE
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A run of cosmetic PrefToggle rows driven by one defs catalogue — the state
 * lookup and handler binding live here so the call sites stay declarative. */
function ToggleGroup({
  defs,
  values,
  onToggle,
}: ToggleGroupProps): ReactElement {
  return (
    <>
      {defs.map((def) => {
        return (
          <PrefToggle
            key={def.key}
            label={def.label}
            description={def.description}
            on={values[def.key]}
            onToggle={() => {
              onToggle(def.key);
            }}
            testid={`pref-toggle-${def.key}`}
          />
        );
      })}
    </>
  );
}

/** A run of cosmetic PrefSegment rows driven by one defs catalogue. */
function SegmentGroup({
  defs,
  values,
  onSelect,
}: SegmentGroupProps): ReactElement {
  return (
    <>
      {defs.map((def) => {
        return (
          <PrefSegment
            key={def.key}
            label={def.label}
            options={def.options}
            value={values[def.key]}
            onChange={(value: string) => {
              onSelect(def.key, value);
            }}
            testid={`pref-segment-${def.key}`}
          />
        );
      })}
    </>
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
  values: Record<string, boolean>;
  onToggle: (key: string) => void;
}

interface SegmentGroupProps {
  defs: readonly SegmentDef[];
  values: Record<string, string>;
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

// DECORATIVE — cosmetic HUD setting, intentionally not wired to any port (spec:
// decorative-but-dead is allowed and explicit). The single REAL control in this
// modal is the Animated-background toggle (wired to useAnimatedBackground); the
// rows below hold throwaway local state purely so the switches/segments respond
// to clicks for the golden + contract tiers.
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
