/**
 * Co-located regression test for the run-once frozen-read trap: the
 * `--amb-play` custom property is the SOLE driver of animation-play-state on
 * all five aurora layers (AmbientBackground.module.css — `data-animated` has
 * no CSS selector), so it must stay REACTIVE to the animated-background
 * preference, not be captured once at mount. The preference double is a real
 * Solid signal (same harness rule as BootSequence.test.tsx): a plain-function
 * double is invisible to Solid's tracking and would mask exactly this bug.
 *
 * The second describe block below is the Solid-local counterpart of
 * client-react's AmbientBackground.test.tsx: which `data-layer` group mounts
 * for each `ambientStyle`. The shared ui-contract tier (packages/ui-contract/
 * src/specs/shell/background/) covers the same branch cross-framework; this
 * file covers it once more locally so a Solid-only regression fails fast.
 */
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { ambientBackgroundPage } from "#tests/ui/pages/AmbientBackgroundPage";

const page = ambientBackgroundPage();

describe("AmbientBackground — animated-background preference", () => {
  it("flips --amb-play (and data-animated) live when the preference toggles after mount", () => {
    const [enabled, setEnabled] = createSignal(false);
    const [level] = createSignal("off" as const);
    const [ambientStyle] = createSignal<"aurora" | "rays">("rays");

    page.mountLive({ enabled, level, ambientStyle });

    expect(page.ambPlay()).toBe("paused");
    expect(page.animatedAttr()).toBe("false");

    // Toggle ON after mount — the layers must start drifting.
    setEnabled(true);
    expect(page.ambPlay()).toBe("running");
    expect(page.animatedAttr()).toBe("true");

    // And back OFF — they must pause again.
    setEnabled(false);
    expect(page.ambPlay()).toBe("paused");
    expect(page.animatedAttr()).toBe("false");
  });
});

describe("AmbientBackground — ambient style branch", () => {
  it("renders the aurora curtains when ambientStyle is aurora", () => {
    page.mount({ ambientStyle: "aurora" });

    expect(page.ambientStyleAttr()).toBe("aurora");
    expect(page.hasLayer("aurora-curtains")).toBe(true);
    expect(page.hasLayer("rays")).toBe(false);
  });

  it("renders the rays layers when ambientStyle is rays", () => {
    page.mount({ ambientStyle: "rays" });

    expect(page.ambientStyleAttr()).toBe("rays");
    expect(page.hasLayer("rays")).toBe(true);
    expect(page.hasLayer("aurora-curtains")).toBe(false);
  });

  it("omits both branches' animated layers under power saver, regardless of style", () => {
    page.mount({ ambientStyle: "aurora", powerSaver: true });

    expect(page.hasLayer("aurora-curtains")).toBe(false);
    expect(page.hasLayer("rays")).toBe(false);
  });
});
