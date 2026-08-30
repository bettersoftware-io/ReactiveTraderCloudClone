import type { JSX } from "react";

import { THEME_MODE_PREFERENCES, type ThemeModePreference } from "@rtc/domain";

import { type PillSegment, SegmentedPill } from "#/ui/SegmentedPill";

/** The appearance sheet's header pill: the design's inline dark/light selector
 * (`Reactive Trader Mobile.dc.html`, appearance-sheet block — a `1px --border`
 * frame at radius 8 holding 9px-mono cells tracked 1.5, the active one filled
 * with the accent and lettered `--onAcc`), plus a third `AUTO` cell for the
 * app's `system` preference, which the design has no equivalent of.
 *
 * `SegmentedPill`'s `modePill` variant is what makes the cells intrinsically
 * sized rather than `flex: 1` — the pill shares the header row with the
 * APPEARANCE title, so it must take only the width its labels need. The title
 * is the element that gives way (`headerTitle` carries `flexShrink: 1` in
 * `AppearanceScreen`), which is what keeps the third cell from ever being
 * pushed off a narrow screen.
 *
 * Presentational: it reports the cell that was pressed and holds no
 * preference state — `AppearanceScreen` owns the cycle arithmetic the
 * ViewModel's setter-less `useThemePreference()` seam requires. */
export function ThemeModePill({
  value,
  onSelect,
}: ThemeModePillProps): JSX.Element {
  return (
    <SegmentedPill
      segments={MODE_CELLS}
      value={value}
      onChange={onSelect}
      variant="modePill"
      frameTestID="appearance-mode-pill"
    />
  );
}

interface ThemeModePillProps {
  readonly value: ThemeModePreference;
  /** Slot: fired with the cell that was pressed, active or not. */
  readonly onSelect: (target: ThemeModePreference) => void;
}

/** Verbatim from the design, glyphs included — a bare `\uXXXX` escape renders
 * as the literal escape sequence in this codebase's JSX, so these are real
 * glyphs. `AUTO` is this app's own third cell (the design stops at two) and
 * takes no glyph: the design's pair are a moon and a sun, and there is no
 * third mark in that family that reads as "follow the system". */
const MODE_LABEL: Record<ThemeModePreference, PillLabel> = {
  dark: { glyph: "☾", label: "DARK" },
  light: { glyph: "☀", label: "LIGHT" },
  system: { label: "AUTO" },
};

interface PillLabel {
  readonly glyph?: string;
  readonly label: string;
}

const MODE_CELLS: readonly PillSegment<ThemeModePreference>[] =
  THEME_MODE_PREFERENCES.map((target) => {
    return {
      key: target,
      ...MODE_LABEL[target],
      testID: `appearance-mode-${target}`,
    };
  });
