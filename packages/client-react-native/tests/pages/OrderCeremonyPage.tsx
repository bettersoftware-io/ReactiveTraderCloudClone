// packages/client-react-native/tests/pages/OrderCeremonyPage.tsx

import type { RenderResult } from "@testing-library/react-native";
import { cleanup } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

import type { OrderTicketState } from "@rtc/client-core";

import { OrderCeremony } from "#/ui/equities/trade/OrderCeremony";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// The "fixed-height slot" test mounts five separate instances SIMULTANEOUSLY
// (no cleanup in between, to compare their slot heights side by side), so
// each mount returns its OWN scoped handle rather than reading off the
// shared `screen` global, which would not distinguish between them.
interface OrderCeremonyHandle {
  exists(testId: string): boolean;
  existsMatching(pattern: RegExp): boolean;
  hasText(text: string): boolean;
  isEmpty(): boolean;
  slotHeight(): number | undefined;
}

function handle(result: RenderResult): OrderCeremonyHandle {
  return {
    exists(testId: string): boolean {
      return result.queryByTestId(testId) != null;
    },
    existsMatching(pattern: RegExp): boolean {
      return result.queryByTestId(pattern) != null;
    },
    hasText(text: string): boolean {
      return result.queryByText(text) != null;
    },
    isEmpty(): boolean {
      return result.toJSON() === null;
    },
    slotHeight(): number | undefined {
      const flattened = StyleSheet.flatten(
        result.getByTestId("eq-order-ceremony-slot").props.style as ViewStyle,
      );
      return typeof flattened.height === "number"
        ? flattened.height
        : undefined;
    },
  };
}

export interface OrderCeremonyPage {
  mount(state: OrderTicketState): Promise<OrderCeremonyHandle>;
  unmountAll(): Promise<void>;
}

/** The framework surface for `OrderCeremony.test.tsx`. Relies on the spec's
 * own `jest.mock` of `expo-haptics`/`useShellMotionEnabled`, hoisted above
 * every import in the spec file. */
export function orderCeremonyPage(): OrderCeremonyPage {
  return {
    async mount(state: OrderTicketState): Promise<OrderCeremonyHandle> {
      const result = await renderWithTheme(<OrderCeremony state={state} />);
      return handle(result);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
  };
}
