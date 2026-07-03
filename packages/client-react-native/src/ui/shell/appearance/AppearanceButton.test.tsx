import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("invokes onPress when tapped", async () => {
  const onPress = jest.fn();
  await renderWithTheme(<AppearanceButton onPress={onPress} />);
  void fireEvent.press(screen.getByTestId("appearance-button"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
