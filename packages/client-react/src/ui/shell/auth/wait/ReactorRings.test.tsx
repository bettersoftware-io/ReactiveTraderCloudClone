import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { ReactorRings } from "./ReactorRings";

afterEach(() => {
  cleanup();
});

test("renders its child", () => {
  render(
    <ReactorRings>
      <span data-testid="emblem-marker">emblem</span>
    </ReactorRings>,
  );

  expect(screen.getByTestId("emblem-marker")).not.toBeNull();
});

test("renders exactly two counter-rotating arc rings, hidden from assistive tech", () => {
  const { container } = render(
    <ReactorRings>
      <span data-testid="emblem-marker">emblem</span>
    </ReactorRings>,
  );

  const rings = container.querySelectorAll("svg[aria-hidden='true']");
  expect(rings.length).toBe(2);
});

test("the rings wrap the child in a shared ancestor rather than standing alone beside it", () => {
  const { container } = render(
    <ReactorRings>
      <span data-testid="emblem-marker">emblem</span>
    </ReactorRings>,
  );

  const marker = screen.getByTestId("emblem-marker");
  const rings = container.querySelectorAll("svg[aria-hidden='true']");

  // The rings and the emblem must share a common parent element (the
  // ReactorRings root) — proving the arcs are laid out AROUND the emblem
  // rather than rendered as a disconnected, standalone cluster elsewhere in
  // the tree.
  const root = container.firstElementChild;
  expect(root).not.toBeNull();
  expect(root?.contains(marker)).toBe(true);

  for (const ring of rings) {
    expect(root?.contains(ring)).toBe(true);
  }

  // The emblem itself must not be nested inside either ring's wrapper — it
  // sits as a sibling slot, so the rings visually surround it instead of
  // containing/clipping it.
  for (const ring of rings) {
    expect(ring.closest('[data-testid="emblem-marker"]')).toBeNull();
    expect(ring.contains(marker)).toBe(false);
  }
});

test("does not carry the auth-wait-reactor testid — that stays on ReactorWait", () => {
  const { container } = render(
    <ReactorRings>
      <span data-testid="emblem-marker">emblem</span>
    </ReactorRings>,
  );

  expect(container.querySelector('[data-testid="auth-wait-reactor"]')).toBe(
    null,
  );
});
