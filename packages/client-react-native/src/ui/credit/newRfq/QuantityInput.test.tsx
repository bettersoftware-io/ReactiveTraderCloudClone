import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { QuantityInput } from "#/ui/credit/newRfq/QuantityInput";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("reports typed quantity", async () => {
  const onChange = jest.fn<(v: string) => void>();
  await renderWithTheme(<QuantityInput value="" onChange={onChange} />);
  void fireEvent.changeText(screen.getByTestId("quantity-input"), "250");
  expect(onChange).toHaveBeenCalledWith("250");
});
