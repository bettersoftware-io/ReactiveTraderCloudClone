import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Instrument } from "@rtc/domain";

import { InstrumentSearch } from "#/ui/credit/newRfq/InstrumentSearch";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
    refPrice: 98.4,
  },
  {
    id: 2,
    name: "Globex 3% 2028",
    cusip: "111111BB2",
    ticker: "GLBX",
    maturity: "2028",
    interestRate: 3,
    benchmark: "T 3.5 2028",
    refPrice: 99.8,
  },
];

test("typing filters instruments and selecting reports it", async () => {
  const onSelect = jest.fn<(i: Instrument | null) => void>();
  await renderWithTheme(
    <InstrumentSearch
      instruments={INSTRUMENTS}
      selected={null}
      onSelect={onSelect}
    />,
  );
  await fireEvent.changeText(
    screen.getByTestId("instrument-search-input"),
    "glbx",
  );
  void fireEvent.press(screen.getByTestId("instrument-result-2"));
  expect(onSelect).toHaveBeenCalledWith(INSTRUMENTS[1]);
});

test("shows the selected instrument with a Change control", async () => {
  const onSelect = jest.fn<(i: Instrument | null) => void>();
  await renderWithTheme(
    <InstrumentSearch
      instruments={INSTRUMENTS}
      selected={INSTRUMENTS[0]}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByText("Acme 5.5% 2030")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("instrument-change"));
  expect(onSelect).toHaveBeenCalledWith(null);
});
