import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Dealer } from "@rtc/domain";

import { DealerSelection } from "#/ui/credit/newRfq/DealerSelection";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const DEALERS: readonly Dealer[] = [
  { id: 1, name: "Bank A" },
  { id: 2, name: "Bank B" },
];

test("toggling an unchecked dealer adds it to the selection", async () => {
  const onChange = jest.fn<(ids: Set<number>) => void>();
  await renderWithTheme(
    <DealerSelection
      dealers={DEALERS}
      selectedIds={new Set([1])}
      onChange={onChange}
    />,
  );
  void fireEvent.press(screen.getByTestId("dealer-2"));
  expect(onChange).toHaveBeenCalledWith(new Set([1, 2]));
});

test("toggling a checked dealer removes it", async () => {
  const onChange = jest.fn<(ids: Set<number>) => void>();
  await renderWithTheme(
    <DealerSelection
      dealers={DEALERS}
      selectedIds={new Set([1, 2])}
      onChange={onChange}
    />,
  );
  void fireEvent.press(screen.getByTestId("dealer-1"));
  expect(onChange).toHaveBeenCalledWith(new Set([2]));
});
