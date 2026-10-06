import { CoreSwapOverlay } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type {
  CoreSwapOverlayProps,
  CoreSwapPhase,
} from "@ui-contract/pages/shell/core/CoreSwapOverlayPage";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  return cleanupMounted();
});

describe("CoreSwapOverlay", () => {
  it("renders nothing while no swap is under way", () => {
    const overlay = mount(CoreSwapOverlay, { props: createProps(null) });

    expect(overlay.isShown()).toBe(false);
  });

  it("names both cores under the CORE SWAP label, outgoing first", () => {
    const overlay = mount(CoreSwapOverlay, {
      props: createProps("loading"),
    });

    expect(overlay.showsLabel()).toBe(true);
    expect(overlay.coreNames()).toEqual(["RxJS", "Effect-TS"]);
  });

  it.each([
    ["covering", "loading"],
    ["loading", "loading"],
    ["handover", "handing over"],
    ["revealing", "online"],
  ] as const)("the status line in the %s phase reads %s", (phase, line) => {
    const overlay = mount(CoreSwapOverlay, { props: createProps(phase) });

    expect(overlay.statusLine()).toBe(line);
  });

  it("is a status region", () => {
    const overlay = mount(CoreSwapOverlay, {
      props: createProps("covering"),
    });

    expect(overlay.role()).toBe("status");
  });

  it("carries one full sentence for assistive technology, and hides the lettering from it", () => {
    const overlay = mount(CoreSwapOverlay, {
      props: createProps("handover"),
    });

    expect(overlay.sentence()).toBe(
      "Swapping application core from RxJS to Effect-TS",
    );
    expect(overlay.hidesLetteringFromAssistiveTechnology()).toBe(true);
  });

  it("marks each phase for the stylesheet as the swap advances", () => {
    const overlay = mount(CoreSwapOverlay, {
      props: createProps("covering"),
    });
    expect(overlay.phase()).toBe("covering");

    overlay.setProps(createProps("revealing"));

    expect(overlay.phase()).toBe("revealing");
    expect(overlay.statusLine()).toBe("online");
  });

  it("hands the swap's fade durations to the stylesheet", () => {
    const overlay = mount(CoreSwapOverlay, {
      props: {
        ...createProps("covering"),
        fade: { enterMs: 160, exitMs: 200 },
      },
    });

    expect(overlay.fadeDurations()).toEqual({ enter: "160ms", exit: "200ms" });
  });

  it("leaves the page once the swap is over", () => {
    const overlay = mount(CoreSwapOverlay, {
      props: createProps("revealing"),
    });
    expect(overlay.isShown()).toBe(true);

    overlay.setProps(createProps(null));

    expect(overlay.isShown()).toBe(false);
  });
});

/** An RxJS → Effect swap in `phase` (null: no swap), with no fade. */
function createProps(phase: CoreSwapPhase | null): CoreSwapOverlayProps {
  return {
    swap:
      phase === null
        ? null
        : {
            from: {
              impl: "rxjs",
              label: "RxJS",
              description: "Observables and operators.",
            },
            to: {
              impl: "effect",
              label: "Effect-TS",
              description: "Fibers, layers and streams.",
            },
            phase,
          },
    fade: { enterMs: 0, exitMs: 0 },
  };
}
