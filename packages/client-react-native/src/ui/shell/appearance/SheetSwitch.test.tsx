import { afterEach, expect, jest, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { sheetSwitchPage } from "#tests/pages/SheetSwitchPage";

const page = sheetSwitchPage();

afterEach(() => {
  return page.unmountAll();
});

test("press reports the value being asked for, not the current one", async () => {
  const onToggle = jest.fn();
  await page.mount(false, onToggle);
  await page.press();
  expect(onToggle).toHaveBeenCalledWith(true);
});

test("press from on asks for off", async () => {
  const onToggle = jest.fn();
  await page.mount(true, onToggle);
  await page.press();
  expect(onToggle).toHaveBeenCalledWith(false);
});

// The control is a Pressable, not RN's `Switch`, so nothing supplies the
// switch semantics for free: without these props a screen reader announces a
// button of unknown state. `props.accessibilityState` is read directly —
// this repo's RNTL version ships no `toHaveAccessibilityState` matcher.
test("announces itself as a switch carrying its checked state", async () => {
  await page.mount(true, () => {});
  expect(page.accessibilityRole()).toBe("switch");
  expect(page.accessibilityChecked()).toBe(true);
  expect(page.accessibilityLabel()).toBe("Ambient background");
});

// The design's geometry is the whole reason this is hand-rolled instead of
// RN's `Switch` (a 51x31 platform track that exposes none of these numbers),
// so the numbers themselves are the contract: a 44x26 track with a 20px knob
// travelling 2 -> 21.
test("the track and knob carry the design's geometry", async () => {
  await page.mount(false, () => {});
  const track = page.trackStyle();
  expect(track.width).toBe(44);
  expect(track.height).toBe(26);

  const knob = page.knobStyle();
  expect(knob.width).toBe(20);
  expect(knob.height).toBe(20);
  expect(knob.left).toBe(2);
});

test("the knob slides to the on position and takes the accent", async () => {
  const t = rnThemeTokens.holo.dark;
  await page.mount(true, () => {});
  const knob = page.knobStyle();
  expect(knob.left).toBe(21);
  expect(knob.backgroundColor).toBe(t.accentPrimary);

  const track = page.trackStyle();
  expect(track.backgroundColor).toBe(t.chip);
});

// Guards the freeze contract the visual tier captures this control under: a
// knob driven by an Animated value (the obvious "improvement" here) would be
// mid-travel in a golden. The two positions must stay static styles.
test("the knob has no transform, so a freeze capture is never mid-travel", async () => {
  await page.mount(true, () => {});
  const knob = page.knobStyle();
  expect(knob.transform).toBeUndefined();
});
