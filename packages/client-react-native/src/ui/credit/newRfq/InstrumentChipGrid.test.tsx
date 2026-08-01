import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Instrument } from "@rtc/domain";

import { InstrumentChipGrid } from "#/ui/credit/newRfq/InstrumentChipGrid";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders a chip per instrument and reports the pressed one", async () => {
  const onSelect = jest.fn<(id: number) => void>();
  await renderWithTheme(
    <InstrumentChipGrid
      instruments={instruments(2)}
      selectedId={null}
      onSelect={onSelect}
    />,
  );

  expect(screen.getAllByTestId(/^instrument-chip-/)).toHaveLength(2);

  await fireEvent.press(screen.getByTestId("instrument-chip-2"));

  expect(onSelect).toHaveBeenCalledWith(2);
});

// The prototype hardcodes six instruments; real `useInstruments()` data does
// not. A seventh must still be reachable — which is why this wraps rather than
// scrolling horizontally, where the overflow would be off-screen.
test("renders every instrument when there are more than six", async () => {
  await renderWithTheme(
    <InstrumentChipGrid
      instruments={instruments(9)}
      selectedId={null}
      onSelect={noop}
    />,
  );

  expect(screen.getAllByTestId(/^instrument-chip-/)).toHaveLength(9);
});

test("marks the selected chip and no other", async () => {
  await renderWithTheme(
    <InstrumentChipGrid
      instruments={instruments(3)}
      selectedId={2}
      onSelect={noop}
    />,
  );

  expect(selectedState(screen.getByTestId("instrument-chip-2"))).toBe(true);
  expect(selectedState(screen.getByTestId("instrument-chip-1"))).toBe(false);
});

test("renders nothing but stays mounted with no instruments yet", async () => {
  await renderWithTheme(
    <InstrumentChipGrid instruments={[]} selectedId={null} onSelect={noop} />,
  );

  expect(screen.queryAllByTestId(/^instrument-chip-/)).toHaveLength(0);
});

function noop(): void {}

/** RNTL v13 dropped `toHaveAccessibilityState`, so read the prop directly. */
function selectedState(
  element: ReturnType<typeof screen.getByTestId>,
): boolean | undefined {
  const state = element.props.accessibilityState as
    | { selected?: boolean }
    | undefined;
  return state?.selected;
}

function instruments(count: number): readonly Instrument[] {
  return Array.from({ length: count }, (_unused, i) => {
    return {
      id: i + 1,
      name: `Instrument ${i + 1}`,
      cusip: `00000${i}AA1`,
      ticker: `INST${i + 1}`,
      maturity: "2030",
      interestRate: 5.5,
      benchmark: "T 4.0 2030",
      refPrice: 98.4,
    };
  });
}
