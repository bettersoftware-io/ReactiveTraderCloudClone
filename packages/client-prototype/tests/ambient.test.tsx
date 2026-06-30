import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { AmbientBackground } from "#/shell/ambient/AmbientBackground";

afterEach(cleanup);

test("renders an aria-hidden ambient layer", () => {
  const { container } = render(<AmbientBackground />);
  const layer = container.querySelector('[data-testid="ambient"]');
  expect(layer).not.toBeNull();
  expect(layer?.getAttribute("aria-hidden")).toBe("true");
});
