import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

// Placeholder proving the vitest + vite-plugin-solid + @solidjs/testing-library
// wiring compiles Solid JSX and mounts it under jsdom. Task 5 replaces this
// with the first toSignal test.
describe("solid-bindings scaffold", () => {
  it("mounts a Solid component", () => {
    const { container } = render(() => {
      return <div data-testid="placeholder" />;
    });

    expect(
      container.querySelector('[data-testid="placeholder"]'),
    ).not.toBeNull();
  });
});
