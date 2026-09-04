// packages/client-react-native/tests/pages/TicketBackdropPage.tsx
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { fireEvent, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface TicketBackdropPage {
  mount(props: BottomSheetBackdropProps): Promise<void>;
  exists(testId: string): boolean;
  press(testId: string): Promise<void>;
  /** The RAW (array-form) `style` prop off a testID — the base spec's own
   * `toContainEqual({ backgroundColor })`, which needs the array shape
   * rather than a flattened object. */
  rawStyleOf(testId: string): unknown;
}

/** The framework surface for `TicketBackdrop.test.tsx`.
 *
 * `TicketBackdrop` is `require()`d lazily inside `mount()` rather than
 * imported at this module's top — mirrors `BlotterModulePage`'s identical
 * ordering trap: a static top-level import here would resolve
 * `TicketBackdrop`'s own `@gorhom/bottom-sheet`/`useShellMotionEnabled`
 * imports before the spec's `mockClose = jest.fn()` /
 * `mockLibraryBackdropProps = []` locals exist, which the spec's
 * `jest.mock("@gorhom/bottom-sheet", ...)` factory closes over. Deferring
 * the require into `mount()`, called from inside a `test()` body, sidesteps
 * the trap. Mirrors the base spec's own identical `require()` placement, one
 * file scope over. */
export function ticketBackdropPage(): TicketBackdropPage {
  return {
    async mount(props: BottomSheetBackdropProps): Promise<void> {
      const { TicketBackdrop } =
        require("#/ui/rates/ticket/TicketBackdrop") as typeof import("#/ui/rates/ticket/TicketBackdrop");
      await renderWithTheme(<TicketBackdrop {...props} />);
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    rawStyleOf(testId: string): unknown {
      return screen.getByTestId(testId).props.style;
    },
  };
}
