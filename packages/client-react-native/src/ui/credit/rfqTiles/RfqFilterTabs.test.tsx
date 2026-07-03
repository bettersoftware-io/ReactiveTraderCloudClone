import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders all five filter tabs", async () => {
  await renderWithTheme(
    <RfqFilterTabs selected="Live" onChange={(): void => {}} />,
  );

  for (const f of ["Live", "All", "Done", "Expired", "Cancelled"]) {
    expect(screen.getByTestId(`rfq-filter-${f}`)).toBeTruthy();
  }
});

test("pressing a tab reports the new filter", async () => {
  const onChange = jest.fn<(f: string) => void>();
  await renderWithTheme(<RfqFilterTabs selected="Live" onChange={onChange} />);
  void fireEvent.press(screen.getByTestId("rfq-filter-Done"));
  expect(onChange).toHaveBeenCalledWith("Done");
});
