import { afterEach, describe, expect, it, vi } from "vitest";

import { createDevtoolsHub } from "#/devtools/createDevtoolsHub";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createDevtoolsHub", () => {
  it("attaches a transport on the rtc-devtools channel when the API exists", () => {
    const channels = createStubBroadcastChannel();

    createDevtoolsHub({ appId: "rtc-test", dev: false });

    expect(channels).toEqual(["rtc-devtools"]);
  });

  it("disposes the hub on pagehide", () => {
    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });
    const dispose = vi.spyOn(hub, "dispose");

    window.dispatchEvent(new Event("pagehide"));

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("builds a hub with no transport where BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const listen = vi.spyOn(window, "addEventListener");

    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });

    // A non-browser runtime must still get a hub, and with no transport there
    // is nothing for a pagehide to say goodbye on.
    expect(typeof hub.dispose).toBe("function");
    expect(listen).not.toHaveBeenCalledWith("pagehide", expect.anything());
  });

  it("builds a hub where window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });

    expect(typeof hub.dispose).toBe("function");
  });
});

/** Replaces BroadcastChannel with an inert stub and returns the channel names
 * it was constructed with. */
function createStubBroadcastChannel(): string[] {
  const names: string[] = [];

  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null;

      constructor(name: string) {
        names.push(name);
      }

      postMessage(): void {}

      close(): void {}

      addEventListener(): void {}

      removeEventListener(): void {}
    },
  );

  return names;
}
