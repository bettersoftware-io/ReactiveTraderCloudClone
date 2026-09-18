// packages/client-react-native/tests/pages/ExposureBubblePage.tsx
import type { SkFont } from "@shopify/react-native-skia";
import { cleanup, screen } from "@testing-library/react-native";

import type { BubbleDrawEntry } from "#/ui/analytics/bubbleDrawModel";
import { ExposureBubble } from "#/ui/analytics/ExposureBubble";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

/** The shape of a rendered node this walk cares about. Declared structurally
 * rather than imported from `react-test-renderer`, which ships no types here
 * and is not a direct dependency. */
interface RenderedNode {
  readonly type?: unknown;
  readonly children?: readonly unknown[] | null;
}

function countIn(node: unknown, type: string): number {
  if (node === null || typeof node !== "object") {
    return 0;
  }

  if (Array.isArray(node)) {
    return node.reduce<number>((total, child) => {
      return total + countIn(child, type);
    }, 0);
  }

  const { type: nodeType, children } = node as RenderedNode;

  return (children ?? []).reduce<number>(
    (total, child) => {
      return total + countIn(child, type);
    },
    nodeType === type ? 1 : 0,
  );
}

/** The one bubble every case draws — EUR, +100.0M, at rest. A case overrides
 * `amount` alone; the rest of the geometry never varied, and
 * `buildBubbleDrawModel` is where geometry is actually asserted. */
const ENTRY: BubbleDrawEntry = {
  currency: "EUR",
  x: 60,
  y: 60,
  radius: 60,
  sign: "pos",
  currencyFontSize: 15,
  currencyBaseline: -1,
  amount: "+100.0M",
  amountBaseline: 10,
};

/** Fixed in every case, so the page owns them. */
const COLOR = "#22c55e";
const AMOUNT_COLOR = "#94a3b8";

/** What a case may vary. The fonts are REQUIRED because every case is about
 * them — both loaded, both still loading (`null`), or the bubble too small
 * for a second label. */
interface ExposureBubbleMountProps {
  currencyFont: SkFont | null;
  amountFont: SkFont | null;
  /** Overrides the default entry's amount only. `null` is the bubble too
   * small for a second line; omitting it keeps `+100.0M`. */
  amount?: string | null;
  /** Default `true`. */
  motionEnabled?: boolean;
}

export interface ExposureBubblePage {
  mount(props: ExposureBubbleMountProps): Promise<void>;
  unmountAll(): Promise<void>;
  /** How many host elements of `type` the rendered tree contains. A bubble is
   * pure Skia, so no part of it carries a `testID` to query — the jest mock
   * renders each Skia primitive as a host element named after it, and
   * counting those is the only real assertion this spec can make about which
   * layers were drawn. */
  countHosts(type: string): number;
}

/** The framework surface for `ExposureBubble.test.tsx`. The spec's own
 * `bubble(overrides)` builder used to live spec-side, with this page taking
 * the composed element; the builder moved here so the page owns the component
 * (`rtc/page-objects-own-their-component`). The call sites are unchanged in
 * spirit — they always named only what they varied — but `entry`, `color` and
 * `amountColor` are now the page's business. */
export function exposureBubblePage(): ExposureBubblePage {
  return {
    async mount(props: ExposureBubbleMountProps): Promise<void> {
      await renderWithTheme(
        <ExposureBubble
          entry={
            props.amount === undefined
              ? ENTRY
              : { ...ENTRY, amount: props.amount }
          }
          color={COLOR}
          amountColor={AMOUNT_COLOR}
          currencyFont={props.currencyFont}
          amountFont={props.amountFont}
          motionEnabled={props.motionEnabled ?? true}
        />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    countHosts(type: string): number {
      return countIn(screen.toJSON(), type);
    },
  };
}
