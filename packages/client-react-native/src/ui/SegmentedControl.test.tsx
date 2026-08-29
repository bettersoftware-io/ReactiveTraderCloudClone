import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { type Segment, SegmentedControl } from "#/ui/SegmentedControl";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const SEGMENTS: readonly Segment<Key>[] = [
  { key: "a", label: "ALPHA" },
  { key: "b", label: "BRAVO" },
];

test("names the frame and each segment from the id prefix", async () => {
  await renderWithTheme(
    <SegmentedControl
      segments={SEGMENTS}
      value="a"
      onChange={(): void => {}}
      idPrefix="demo"
    />,
  );
  expect(screen.getByTestId("demo-nav")).toBeTruthy();
  expect(screen.getByTestId("demo-tab-a")).toHaveTextContent("ALPHA");
  expect(screen.getByTestId("demo-tab-b")).toHaveTextContent("BRAVO");
});

test("marks only the current segment selected", async () => {
  await renderWithTheme(
    <SegmentedControl
      segments={SEGMENTS}
      value="b"
      onChange={(): void => {}}
      idPrefix="demo"
    />,
  );
  expect(selected("demo-tab-a")).toBe(false);
  expect(selected("demo-tab-b")).toBe(true);
});

test("reports the pressed segment's key", async () => {
  const onChange = jest.fn<(key: Key) => void>();
  await renderWithTheme(
    <SegmentedControl
      segments={SEGMENTS}
      value="a"
      onChange={onChange}
      idPrefix="demo"
    />,
  );
  await fireEvent.press(screen.getByTestId("demo-tab-b"));
  expect(onChange).toHaveBeenCalledWith("b");
});

function selected(testId: string): boolean {
  const state = screen.getByTestId(testId).props.accessibilityState as
    | { selected?: boolean }
    | undefined;

  return state?.selected === true;
}

type Key = "a" | "b";
