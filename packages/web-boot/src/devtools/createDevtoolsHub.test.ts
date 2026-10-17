import { afterEach, describe, expect, it, vi } from "vitest";

import { PROTOCOL_VERSION } from "@rtc/devtools-core";

import { createDevtoolsHub } from "#/devtools/createDevtoolsHub";

import { createRecordingBroadcastChannel } from "../__tests__/recordingBroadcastChannel";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createDevtoolsHub", () => {
  it("attaches a transport on the rtc-devtools channel when the API exists", () => {
    const channel = createRecordingBroadcastChannel();

    createDevtoolsHub({ appId: "rtc-test", dev: false });

    expect(channel.names).toEqual(["rtc-devtools"]);
  });

  it("answers an inspector with the app id and the dev flag it was given", () => {
    const channel = createRecordingBroadcastChannel();

    createDevtoolsHub({ appId: "rtc-test", dev: true });
    channel.deliver({ kind: "hello", v: PROTOCOL_VERSION });

    // `dev` is what lets the inspector inject intents, so a hub that dropped
    // or hard-coded it would open that write path on a production build.
    expect(channel.posted).toContainEqual(
      expect.objectContaining({
        kind: "welcome",
        appId: "rtc-test",
        dev: true,
      }),
    );
  });

  it("tells the inspector a production build is not a dev build", () => {
    const channel = createRecordingBroadcastChannel();

    createDevtoolsHub({ appId: "rtc-test", dev: false });
    channel.deliver({ kind: "hello", v: PROTOCOL_VERSION });

    expect(channel.posted).toContainEqual(
      expect.objectContaining({ kind: "welcome", dev: false }),
    );
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
});
