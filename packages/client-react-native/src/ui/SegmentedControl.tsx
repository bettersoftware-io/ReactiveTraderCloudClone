import type { JSX } from "react";

import { type PillSegment, SegmentedPill } from "#/ui/SegmentedPill";

/** The module sub-nav the design puts under the header on the Credit and
 * Equities screens (`credTabs`/`eqTabs`) — `SegmentedPill`'s `subNav`
 * geometry plus the id scheme those screens' contracts key on.
 *
 * That scheme is this component's whole reason to exist: `idPrefix` fixes the
 * test surface as `${idPrefix}-nav` for the frame and `${idPrefix}-tab-${key}`
 * for each segment, derived in ONE place rather than spelled out per cell in
 * `EquitiesNav` and `CreditNav`. */
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
  idPrefix,
}: SegmentedControlProps<K>): JSX.Element {
  const cells: readonly PillSegment<K>[] = segments.map((segment) => {
    return { ...segment, testID: `${idPrefix}-tab-${segment.key}` };
  });

  return (
    <SegmentedPill
      segments={cells}
      value={value}
      onChange={onChange}
      variant="subNav"
      frameTestID={`${idPrefix}-nav`}
    />
  );
}

export interface Segment<K extends string> {
  readonly key: K;
  readonly label: string;
}

interface SegmentedControlProps<K extends string> {
  readonly segments: readonly Segment<K>[];
  readonly value: K;
  readonly onChange: (key: K) => void;
  readonly idPrefix: string;
}
