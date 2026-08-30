import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { SheetSwitch } from "#/ui/shell/appearance/SheetSwitch";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("press reports the value being asked for, not the current one", async () => {
  const onToggle = jest.fn();
  await renderWithTheme(
    <SheetSwitch
      testID="switch"
      accessibilityLabel="Ambient background"
      checked={false}
      onToggle={onToggle}
    />,
  );
  await fireEvent.press(screen.getByTestId("switch"));
  expect(onToggle).toHaveBeenCalledWith(true);
});

test("press from on asks for off", async () => {
  const onToggle = jest.fn();
  await renderWithTheme(
    <SheetSwitch
      testID="switch"
      accessibilityLabel="Ambient background"
      checked
      onToggle={onToggle}
    />,
  );
  await fireEvent.press(screen.getByTestId("switch"));
  expect(onToggle).toHaveBeenCalledWith(false);
});

// The control is a Pressable, not RN's `Switch`, so nothing supplies the
// switch semantics for free: without these props a screen reader announces a
// button of unknown state. `props.accessibilityState` is read directly —
// this repo's RNTL version ships no `toHaveAccessibilityState` matcher.
test("announces itself as a switch carrying its checked state", async () => {
  await renderWithTheme(
    <SheetSwitch
      testID="switch"
      accessibilityLabel="Ambient background"
      checked
      onToggle={(): void => {}}
    />,
  );
  const node = screen.getByTestId("switch");
  expect(node.props.accessibilityRole).toBe("switch");
  expect(
    (node.props.accessibilityState as { checked?: boolean } | undefined)
      ?.checked,
  ).toBe(true);
  expect(node.props.accessibilityLabel).toBe("Ambient background");
});

// The design's geometry is the whole reason this is hand-rolled instead of
// RN's `Switch` (a 51x31 platform track that exposes none of these numbers),
// so the numbers themselves are the contract: a 44x26 track with a 20px knob
// travelling 2 -> 21.
test("the track and knob carry the design's geometry", async () => {
  await renderWithTheme(
    <SheetSwitch
      testID="switch"
      accessibilityLabel="Ambient background"
      checked={false}
      onToggle={(): void => {}}
    />,
  );
  const track = StyleSheet.flatten(
    screen.getByTestId("switch").props.style as ViewStyle,
  );
  expect(track.width).toBe(44);
  expect(track.height).toBe(26);

  const knob = StyleSheet.flatten(
    screen.getByTestId("switch-knob").props.style as ViewStyle,
  );
  expect(knob.width).toBe(20);
  expect(knob.height).toBe(20);
  expect(knob.left).toBe(2);
});

test("the knob slides to the on position and takes the accent", async () => {
  const t = rnThemeTokens.holo.dark;
  await renderWithTheme(
    <SheetSwitch
      testID="switch"
      accessibilityLabel="Ambient background"
      checked
      onToggle={(): void => {}}
    />,
  );
  const knob = StyleSheet.flatten(
    screen.getByTestId("switch-knob").props.style as ViewStyle,
  );
  expect(knob.left).toBe(21);
  expect(knob.backgroundColor).toBe(t.accentPrimary);

  const track = StyleSheet.flatten(
    screen.getByTestId("switch").props.style as ViewStyle,
  );
  expect(track.backgroundColor).toBe(t.chip);
});

// Guards the freeze contract the visual tier captures this control under: a
// knob driven by an Animated value (the obvious "improvement" here) would be
// mid-travel in a golden. The two positions must stay static styles.
test("the knob has no transform, so a freeze capture is never mid-travel", async () => {
  await renderWithTheme(
    <SheetSwitch
      testID="switch"
      accessibilityLabel="Ambient background"
      checked
      onToggle={(): void => {}}
    />,
  );
  const knob = StyleSheet.flatten(
    screen.getByTestId("switch-knob").props.style as ViewStyle,
  );
  expect(knob.transform).toBeUndefined();
});
