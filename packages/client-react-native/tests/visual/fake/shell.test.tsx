import { describe, expect, test } from "@jest/globals";

import { ConnectionStatus } from "@rtc/domain";

import { buildShellSlice } from "./shell";

describe("buildShellSlice — determinism", () => {
  test("useAmbientStyle returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useAmbientStyle()).toBe(slice.useAmbientStyle());
    expect(slice.useAmbientStyle()).toEqual(
      buildShellSlice().useAmbientStyle(),
    );
  });

  test("useAnimatedBackground returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useAnimatedBackground()).toBe(slice.useAnimatedBackground());
    expect(slice.useAnimatedBackground()).toEqual(
      buildShellSlice().useAnimatedBackground(),
    );
  });

  test("useAuth returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useAuth()).toBe(slice.useAuth());
    expect(slice.useAuth()).toEqual(buildShellSlice().useAuth());
  });

  test("useBootGate returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useBootGate()).toBe(slice.useBootGate());
    expect(slice.useBootGate()).toEqual(buildShellSlice().useBootGate());
  });

  test("useBootSequence returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useBootSequence(noop)).toBe(slice.useBootSequence(noop));
    expect(slice.useBootSequence(noop)).toEqual(
      buildShellSlice().useBootSequence(noop),
    );
  });

  test("useConnectionStatus returns the same value on repeat calls, and across a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useConnectionStatus()).toBe(slice.useConnectionStatus());
    expect(slice.useConnectionStatus()).toBe(
      buildShellSlice().useConnectionStatus(),
    );
  });

  test("useForceBootAnimation returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useForceBootAnimation()).toBe(slice.useForceBootAnimation());
    expect(slice.useForceBootAnimation()).toEqual(
      buildShellSlice().useForceBootAnimation(),
    );
  });

  test("useIncident returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useIncident()).toBe(slice.useIncident());
    expect(slice.useIncident()).toEqual(buildShellSlice().useIncident());
  });

  test("useLoginWaitPreferences returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useLoginWaitPreferences()).toBe(
      slice.useLoginWaitPreferences(),
    );
    expect(slice.useLoginWaitPreferences()).toEqual(
      buildShellSlice().useLoginWaitPreferences(),
    );
  });

  test("usePowerSaver returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.usePowerSaver()).toBe(slice.usePowerSaver());
    expect(slice.usePowerSaver()).toEqual(buildShellSlice().usePowerSaver());
  });

  test("useReconnect returns the same function on repeat calls, and across a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useReconnect()).toBe(slice.useReconnect());
    expect(slice.useReconnect()).toBe(buildShellSlice().useReconnect());
  });

  test("useThemePreference returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useThemePreference()).toBe(slice.useThemePreference());
    expect(slice.useThemePreference()).toEqual(
      buildShellSlice().useThemePreference(),
    );
  });

  test("useThemeSkinPreference returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useThemeSkinPreference()).toBe(slice.useThemeSkinPreference());
    expect(slice.useThemeSkinPreference()).toEqual(
      buildShellSlice().useThemeSkinPreference(),
    );
  });

  test("useViewModePreference returns the same reference on repeat calls, and an equal value from a fresh instance", () => {
    const slice = buildShellSlice();
    expect(slice.useViewModePreference()).toBe(slice.useViewModePreference());
    expect(slice.useViewModePreference()).toEqual(
      buildShellSlice().useViewModePreference(),
    );
  });
});

describe("buildShellSlice — default values", () => {
  test("useAuth reports unauthenticated, with no user and no error", () => {
    const { state } = buildShellSlice().useAuth();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.error).toBeNull();
  });

  test("useBootGate is hidden", () => {
    expect(buildShellSlice().useBootGate().visible).toBe(false);
  });

  test("useConnectionStatus defaults to CONNECTED, matching what VisualScenarioHost's synchronous gatewayConnected produces for every scenario today", () => {
    expect(buildShellSlice().useConnectionStatus()).toBe(
      ConnectionStatus.CONNECTED,
    );
  });
});

describe("buildShellSlice — options thread through to their hook", () => {
  test("skin threads to useThemeSkinPreference", () => {
    expect(
      buildShellSlice({ skin: "neon" }).useThemeSkinPreference().skin,
    ).toBe("neon");
  });

  test("mode threads to useThemePreference (both the resolved mode and the stored preference)", () => {
    const { mode, modePreference } = buildShellSlice({
      mode: "light",
    }).useThemePreference();
    expect(mode).toBe("light");
    expect(modePreference).toBe("light");
  });

  test("powerSaverLevel threads to usePowerSaver, including the derived isCalm/isFreeze flags", () => {
    const { level, isCalm, isFreeze } = buildShellSlice({
      powerSaverLevel: "freeze",
    }).usePowerSaver();
    expect(level).toBe("freeze");
    expect(isCalm).toBe(true);
    expect(isFreeze).toBe(true);
  });

  test("animatedBackground threads to useAnimatedBackground", () => {
    expect(
      buildShellSlice({ animatedBackground: true }).useAnimatedBackground()
        .enabled,
    ).toBe(true);
  });

  test("connectionStatus threads to useConnectionStatus", () => {
    // DISCONNECTED specifically: it differs from the CONNECTED default, so
    // this proves the option actually overrides rather than coincidentally
    // matching what buildShellSlice() would return anyway.
    expect(
      buildShellSlice({
        connectionStatus: ConnectionStatus.DISCONNECTED,
      }).useConnectionStatus(),
    ).toBe(ConnectionStatus.DISCONNECTED);
  });
});

describe("buildShellSlice — every intent is a no-op", () => {
  test("useAmbientStyle().setStyle does not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useAmbientStyle();
    expect(() => {
      before.setStyle("rays");
    }).not.toThrow();
    expect(slice.useAmbientStyle()).toBe(before);
  });

  test("useAnimatedBackground().setEnabled/toggle do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useAnimatedBackground();
    expect(() => {
      before.setEnabled(true);
      before.toggle();
    }).not.toThrow();
    expect(slice.useAnimatedBackground()).toBe(before);
  });

  test("useAuth's login/unlock/lock/logout do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useAuth();
    expect(() => {
      before.login("astark", "mcdc2026");
      before.unlock("mcdc2026");
      before.lock();
      before.logout();
    }).not.toThrow();
    expect(slice.useAuth()).toBe(before);
  });

  test("useBootGate's reboot/dismiss do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useBootGate();
    expect(() => {
      before.reboot();
      before.dismiss();
    }).not.toThrow();
    expect(slice.useBootGate()).toBe(before);
  });

  test("useBootSequence's skip does not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useBootSequence(noop);
    expect(() => {
      before.skip();
    }).not.toThrow();
    expect(slice.useBootSequence(noop)).toBe(before);
  });

  test("useForceBootAnimation's setEnabled/toggle do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useForceBootAnimation();
    expect(() => {
      before.setEnabled(true);
      before.toggle();
    }).not.toThrow();
    expect(slice.useForceBootAnimation()).toBe(before);
  });

  test("useIncident's inject/clear do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useIncident();
    expect(() => {
      before.inject("serviceDown");
      before.clear();
    }).not.toThrow();
    expect(slice.useIncident()).toBe(before);
  });

  test("useLoginWaitPreferences's setStyle/setDelay do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useLoginWaitPreferences();
    expect(() => {
      before.setStyle("reactor");
      before.setDelay("3s");
    }).not.toThrow();
    expect(slice.useLoginWaitPreferences()).toBe(before);
  });

  test("usePowerSaver's setLevel/cycle do not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.usePowerSaver();
    expect(() => {
      before.setLevel("calm");
      before.cycle();
    }).not.toThrow();
    expect(slice.usePowerSaver()).toBe(before);
  });

  test("useReconnect's returned command does not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useReconnect();
    expect(() => {
      before();
    }).not.toThrow();
    expect(slice.useReconnect()).toBe(before);
  });

  test("useThemePreference's cycle does not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useThemePreference();
    expect(() => {
      before.cycle();
    }).not.toThrow();
    expect(slice.useThemePreference()).toBe(before);
  });

  test("useThemeSkinPreference's setSkin does not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useThemeSkinPreference();
    expect(() => {
      before.setSkin("terminal3d");
    }).not.toThrow();
    expect(slice.useThemeSkinPreference()).toBe(before);
  });

  test("useViewModePreference's setViewMode does not throw or change a later read", () => {
    const slice = buildShellSlice();
    const before = slice.useViewModePreference();
    expect(() => {
      before.setViewMode("price");
    }).not.toThrow();
    expect(slice.useViewModePreference()).toBe(before);
  });
});

/** Stand-in `onDone` for `useBootSequence` — its value is never asserted on,
 * only its identity across calls, so a shared no-op is enough. */
function noop(): void {}
