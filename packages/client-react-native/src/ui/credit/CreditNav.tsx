import type { JSX } from "react";

import { type Segment, SegmentedControl } from "#/ui/SegmentedControl";

/** The credit sub-nav — the design's `RFQS · NEW RFQ · SELL-SIDE` segmented
 * control under the header. Mirrors `EquitiesNav`; ids `credit-nav` /
 * `credit-tab-${view}`. */
export function CreditNav({ view, onChange }: CreditNavProps): JSX.Element {
  return (
    <SegmentedControl
      segments={SEGMENTS}
      value={view}
      onChange={onChange}
      idPrefix="credit"
    />
  );
}

export type CreditView = "tiles" | "new-rfq" | "sell-side";

const SEGMENTS: readonly Segment<CreditView>[] = [
  { key: "tiles", label: "RFQS" },
  { key: "new-rfq", label: "NEW RFQ" },
  { key: "sell-side", label: "SELL-SIDE" },
];

interface CreditNavProps {
  view: CreditView;
  onChange: (view: CreditView) => void;
}
