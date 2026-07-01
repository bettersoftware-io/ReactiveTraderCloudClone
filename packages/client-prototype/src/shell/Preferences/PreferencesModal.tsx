/**
 * PreferencesModal — faithful port of the PROTO preferences panel.
 *
 * Fidelity note: only `animatedBg` and `reduceMotion` affect rendering (by
 * toggling the `--amb-play` CSS variable via PreferencesProvider). All other
 * ~22 controls are faithful-but-cosmetic — they update state and reflect
 * correctly in the UI but do not drive additional behaviour, matching the
 * prototype.
 */
import type {
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
} from "react";

import styles from "#/shell/Preferences/PreferencesModal.module.css";
import { SEGMENT_DEFS } from "#/shell/Preferences/prefs";
import { SegmentedControl } from "#/shell/Preferences/SegmentedControl";
import { ToggleRow } from "#/shell/Preferences/ToggleRow";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface PreferencesModalProps {
  onClose(): void;
}

export function PreferencesModal(props: PreferencesModalProps): ReactElement {
  const { onClose } = props;
  const { prefs, setPref, togglePref } = usePreferences();

  function handleScaleChange(e: ChangeEvent<HTMLInputElement>): void {
    setPref("uiScale", Number.parseInt(e.target.value, 10));
  }

  function handleOverlayClick(e: MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleOverlayKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal={true}
      aria-label="Preferences"
      className={styles.overlay}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>PREFERENCES</div>
            <div className={styles.subtitle}>
              DISPLAY · TRADING · NOTIFICATIONS · DATA
            </div>
          </div>
          <button
            type="button"
            aria-label="Close preferences"
            className={styles.closeBtn}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid}>
            <div>
              <div className={styles.sectionHead}>DISPLAY</div>
              <ToggleRow
                label="Animated background"
                hint="Drifting aurora & grid. Static is lighter on CPU/GPU."
                on={prefs.animatedBg}
                onToggle={() => {
                  togglePref("animatedBg");
                }}
              />
              <ToggleRow
                label="Reduce motion"
                hint="Disable all ambient animation."
                on={prefs.reduceMotion}
                onToggle={() => {
                  togglePref("reduceMotion");
                }}
              />
              <ToggleRow
                label="Glass blur panels"
                hint="Frosted panel backdrop."
                on={prefs.glassBlur}
                onToggle={() => {
                  togglePref("glassBlur");
                }}
              />
              <ToggleRow
                label="Background grid"
                on={prefs.showGrid}
                onToggle={() => {
                  togglePref("showGrid");
                }}
              />
              <ToggleRow
                label="Scanline overlay"
                on={prefs.scanlines}
                onToggle={() => {
                  togglePref("scanlines");
                }}
              />
              <SegmentedControl
                label="Density"
                options={SEGMENT_DEFS.density}
                value={prefs.density}
                onSelect={(opt: string) => {
                  setPref("density", opt);
                }}
              />
              <SegmentedControl
                label="Display font"
                options={SEGMENT_DEFS.fontFace}
                value={prefs.fontFace}
                onSelect={(opt: string) => {
                  setPref("fontFace", opt);
                }}
              />
              <div className={styles.scaleRow}>
                <div className={styles.label}>Interface scale</div>
                <div className={styles.scaleControls}>
                  <input
                    type="range"
                    min={80}
                    max={120}
                    step={5}
                    value={prefs.uiScale}
                    onChange={handleScaleChange}
                    aria-label="Interface scale"
                    className={styles.range}
                  />
                  <span className={styles.scaleValue}>{prefs.uiScale}%</span>
                </div>
              </div>

              <div className={`${styles.sectionHead} ${styles.sectionHeadMid}`}>
                TRADING
              </div>
              <ToggleRow
                label="One-click trading"
                hint="Execute without confirmation."
                on={prefs.oneClick}
                onToggle={() => {
                  togglePref("oneClick");
                }}
              />
              <ToggleRow
                label="Confirm before execute"
                on={prefs.confirmExec}
                onToggle={() => {
                  togglePref("confirmExec");
                }}
              />
              <ToggleRow
                label="Execution sound"
                on={prefs.execSound}
                onToggle={() => {
                  togglePref("execSound");
                }}
              />
              <SegmentedControl
                label="Price precision"
                options={SEGMENT_DEFS.precision}
                value={prefs.precision}
                onSelect={(opt: string) => {
                  setPref("precision", opt);
                }}
              />
            </div>

            <div>
              <div className={styles.sectionHead}>NOTIFICATIONS</div>
              <ToggleRow
                label="Desktop alerts"
                hint="Trade fills & rejections."
                on={prefs.desktopAlerts}
                onToggle={() => {
                  togglePref("desktopAlerts");
                }}
              />
              <ToggleRow
                label="Price alerts"
                on={prefs.priceAlerts}
                onToggle={() => {
                  togglePref("priceAlerts");
                }}
              />
              <ToggleRow
                label="Market news feed"
                on={prefs.marketNews}
                onToggle={() => {
                  togglePref("marketNews");
                }}
              />

              <div className={`${styles.sectionHead} ${styles.sectionHeadMid}`}>
                DATA &amp; PRIVACY
              </div>
              <SegmentedControl
                label="Live refresh rate"
                options={SEGMENT_DEFS.refreshRate}
                value={prefs.refreshRate}
                onSelect={(opt: string) => {
                  setPref("refreshRate", opt);
                }}
              />
              <SegmentedControl
                label="Time zone"
                options={SEGMENT_DEFS.timezone}
                value={prefs.timezone}
                onSelect={(opt: string) => {
                  setPref("timezone", opt);
                }}
              />
              <ToggleRow
                label="Connection heartbeat"
                hint="Keep-alive ping to gateway."
                on={prefs.heartbeat}
                onToggle={() => {
                  togglePref("heartbeat");
                }}
              />
              <ToggleRow
                label="Anonymous telemetry"
                on={prefs.telemetry}
                onToggle={() => {
                  togglePref("telemetry");
                }}
              />
              <ToggleRow
                label="Crash reports"
                on={prefs.crashReports}
                onToggle={() => {
                  togglePref("crashReports");
                }}
              />
              <ToggleRow
                label="Beta modules"
                hint="Early-access trading tools."
                on={prefs.betaModules}
                onToggle={() => {
                  togglePref("betaModules");
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerHint}>
            ⚡ Static background recommended — lowest GPU load
          </div>
          <button type="button" className={styles.doneBtn} onClick={onClose}>
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
