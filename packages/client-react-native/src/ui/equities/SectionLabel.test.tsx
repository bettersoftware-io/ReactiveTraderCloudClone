import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { SectionLabel } from "#/ui/equities/SectionLabel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the caption; `spaced` adds the follow-on top margin", async () => {
  await renderWithTheme(
    <>
      <SectionLabel>ORDERS</SectionLabel>
      <SectionLabel spaced>POSITIONS</SectionLabel>
    </>,
  );
  expect(screen.getByText("ORDERS")).toHaveStyle({ marginTop: 3 });
  expect(screen.getByText("POSITIONS")).toHaveStyle({ marginTop: 12 });
});
