import type { JSX } from "react";

import { type Segment, SegmentedControl } from "#/ui/SegmentedControl";

/** The equities sub-nav — the design's `MARKETS · TRADE · BLOTTER` segmented
 * control under the header. Mirrors `CreditNav`; ids `equities-nav` /
 * `equities-tab-${view}`. */
export function EquitiesNav({ view, onChange }: EquitiesNavProps): JSX.Element {
  return (
    <SegmentedControl
      segments={SEGMENTS}
      value={view}
      onChange={onChange}
      idPrefix="equities"
    />
  );
}

export type EquitiesView = "markets" | "trade" | "blotters";

const SEGMENTS: readonly Segment<EquitiesView>[] = [
  { key: "markets", label: "MARKETS" },
  { key: "trade", label: "TRADE" },
  { key: "blotters", label: "BLOTTER" },
];

interface EquitiesNavProps {
  view: EquitiesView;
  onChange: (view: EquitiesView) => void;
}
