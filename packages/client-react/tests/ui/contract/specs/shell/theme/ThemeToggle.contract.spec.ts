import { ThemeToggle } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  // The ThemeProvider reads the theme through the seam (a fresh World per mount,
  // defaulting to dark) and publishes it on the document root; reset the root
  // dataset so each spec starts from a clean global state.
  delete document.documentElement.dataset.mode;
});

afterEach(() => {
  return cleanupMounted();
});

describe("ThemeToggle", () => {
  it("starts on the default (dark) theme and announces the inverse", () => {
    const toggle = mount(ThemeToggle);
    expect(toggle.documentMode()).toBe("dark");
    expect(toggle.ariaLabel()).toMatch(/switch to light theme/i);
  });

  it("advances dark → light on the first click, announcing system next", async () => {
    const toggle = mount(ThemeToggle);
    expect(toggle.documentMode()).toBe("dark");
    await toggle.toggle();
    expect(toggle.documentMode()).toBe("light");
    expect(toggle.ariaLabel()).toMatch(/switch to system theme/i);
  });

  it("cycles light → system → dark across further clicks", async () => {
    const toggle = mount(ThemeToggle);
    await toggle.toggle(); // dark → light
    await toggle.toggle(); // light → system (resolves to dark with no OS query)
    expect(toggle.ariaLabel()).toMatch(/switch to dark theme/i);
    await toggle.toggle(); // system → dark
    expect(toggle.documentMode()).toBe("dark");
    expect(toggle.ariaLabel()).toMatch(/switch to light theme/i);
  });
});
