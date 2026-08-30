import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";

import type { PowerSaverLevel, ThemeMode, ThemeSkin } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { useAppFonts } from "#/ui/theme/fonts";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { useTheme } from "#/ui/theme/useTheme";

import { buildFakeViewModel } from "./buildFakeViewModel";

interface Props {
  skin: ThemeSkin;
  mode: ThemeMode;
  /** Freezes ambient/animated-background motion for a deterministic capture.
   * Default true — this host exists to be screenshotted, so a scenario should
   * never be caught mid-animation (rehaul Phase 1 amendment A5). Threaded
   * through as `buildFakeViewModel`'s `animatedBackground` option (inverted:
   * `forceReduceMotion` true means `animatedBackground` false) — the same
   * production knob a device's OS-level "reduce motion" already collapses to
   * (see `packages/domain/src/preferences/preferences.ts`), so this needs no
   * new ThemeProvider surface. */
  forceReduceMotion?: boolean;
  /**
   * Power-saver tier to seed, default `off` (production's default, so existing
   * scenarios are unaffected).
   *
   * `forceReduceMotion` above does NOT cover every animation: it seeds
   * `animatedBackground`, which gates the ambient layer only. Widget-level
   * motion — the Analytics bars' and bubbles' entry tweens — is gated by
   * `useShellMotionEnabled`, which reads the OS reduce-motion flag and this
   * power-saver level, neither of which `animatedBackground` touches. A
   * scenario containing those widgets must seed `freeze` or it can be captured
   * mid-tween.
   *
   * Freeze is safe to pin a golden against because on React Native it feeds
   * nothing but motion gates (`useShellMotionEnabled`, `useBootMotionEnabled`)
   * — no badge, no alternative styling. The captured pixels are the resting
   * state, which is exactly what a golden should hold.
   */
  powerSaverLevel?: PowerSaverLevel;
  /**
   * Per-scenario hook replacements, threaded straight through to
   * `buildFakeViewModel`'s `overrides` option — for pinning a state the
   * shared fixtures do not cover (an error arm, an empty collection, a
   * specific machine phase). Applied last, after every other fixture, so it
   * always wins.
   */
  viewModelOverrides?: Partial<ViewModel>;
  children: ReactNode;
}

/** Readiness probe only — the font it builds is never drawn, so the size is
 * arbitrary. `useBootSceneFonts` resolves both faces regardless of how many
 * sites a caller declares, so one entry is enough to observe the load. */
const HARNESS_FONT_PROBE = { probe: { size: 12 } } as const;

/** Mounts one static, isolated `ViewModel` per scenario, built by
 * `buildFakeViewModel` — fixed snapshots and no-op intents, not a live
 * simulator composition, so a capture is deterministic by construction
 * rather than by remembering to pin each simulator (see
 * `buildFakeViewModel.ts`'s own doc for why). A skin×mode is pinned via the
 * fake's shell slice (not the persisted device preference), and each mount
 * is self-contained, so scenarios never leak state between captures.
 * `ThemeProvider` reads skin/mode from the ViewModel's preference presenters
 * (confirmed against `ThemeProvider.tsx` — it takes no skin/mode props), so
 * pinning happens by building the fake with those options, not by a
 * ThemeProvider override; no production touch was needed for the skin/mode
 * axis.
 *
 * Renders `children` ONLY once both font paths have loaded, and sets
 * `testID="visual-ready"` on the root one frame after that — the RN text
 * families (`useAppFonts`) and the Skia typefaces the boot scenes draw with —
 * the same rendered-ready marker the capture drivers (Tasks 1.x/2.x/3.x) wait
 * on before taking the screenshot.
 *
 * WHY `children` IS GATED AND NOT MERELY THE MARKER. iOS resolves a `<Text>`'s
 * `fontFamily` when the node is CREATED, and no later re-render re-resolves
 * it. So a scenario mounted before `useAppFonts()` reported loaded painted its
 * text in the SYSTEM font FOREVER, however long the driver then waited — the
 * marker's one-frame delay bought nothing, because the damage was done on the
 * first commit. Fixtures whose text arrives on a later commit escaped by
 * accident (`lock/hold` shows real Orbitron); first-commit ones did not (the
 * boot chrome, and `ShellHeader`'s wordmark). The app was never exposed:
 * `app/(app)/_layout.tsx` holds first paint on the same `useAppFonts()` and
 * renders a bare `testID="fonts-loading"` view until it passes. This harness
 * simply did not mirror that, so the goldens pinned system-font text as
 * correct. Gating here makes the harness's first commit the app's first
 * commit.
 *
 * The gate deliberately sits one commit AHEAD of the marker: children mount on
 * the commit where fonts become ready, and `visual-ready` follows a frame
 * later, so the marker can never appear before real-font text has painted. */
export function VisualScenarioHost({
  skin,
  mode,
  forceReduceMotion = true,
  powerSaverLevel = "off",
  viewModelOverrides,
  children,
}: Props): ReactNode {
  const fontsLoaded = useAppFonts();
  // The Skia typefaces the boot scenes draw text with load on their OWN
  // async path, separate from `useAppFonts` — so a scenario could otherwise
  // be captured in the window where geometry has drawn and text has not, and
  // that golden would then pin missing text as correct. That is exactly how
  // the text this gate protects went unnoticed for weeks. Gated here for
  // every scenario, not just `boot/*`: the wait is a few milliseconds, and a
  // host that only guards the scenarios someone remembered to list is the
  // same trap one level up.
  const skiaFontsLoaded = useBootSceneFonts(HARNESS_FONT_PROBE) !== null;
  const fontsReady = fontsLoaded && skiaFontsLoaded;
  const [viewModel] = useState(() => {
    return buildFakeViewModel({
      skin,
      mode,
      powerSaverLevel,
      animatedBackground: !forceReduceMotion,
      overrides: viewModelOverrides,
    });
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!fontsReady) {
      return undefined;
    }

    const handle = requestAnimationFrame(() => {
      setReady(true);
    });

    return () => {
      cancelAnimationFrame(handle);
    };
  }, [fontsReady]);

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <ScenarioSurface ready={ready}>
          {fontsReady ? children : null}
        </ScenarioSurface>
      </ThemeProvider>
    </ViewModelProvider>
  );
}

/**
 * The themed surface every scenario is captured against.
 *
 * WHY THIS EXISTS AS ITS OWN COMPONENT. `backgroundColor` has to come from
 * `useTheme()`, which only resolves BELOW `ThemeProvider` — so the root view
 * cannot be inline in `VisualScenarioHost`'s own tree.
 *
 * WHY IT PAINTS A BACKGROUND AT ALL. Every fixture that mounts a LEAF rather
 * than a screen — `BootSceneFixture` (a bare `<Canvas>`, since replaced by
 * the full-screen `BootSequenceFixture`), `LockHoldFixture`
 * (the ring alone), `AnalyticsDashboardFixture` (the cards alone) — leaves
 * behind whatever the harness root is, and RN's default is white. The real
 * app never shows that: `BootSequence` and `LockScreen` both paint
 * `t.bgPrimary`. Six of the eight committed simctl goldens were captured over
 * white as a result, which is why #353's "reproducing at 0.01-0.05%" was true
 * and meaningless — they reproduced a wrong background faithfully.
 *
 * Full-screen scenarios (`shell/appearance`) paint over this and are
 * unaffected. Deliberately `bgPrimary` rather than a fixed colour, so a
 * light-pinned scenario (`shell/connection-banner` is classic/light) gets its
 * own theme's light background instead of RN's white.
 */
function ScenarioSurface({ ready, children }: SurfaceProps): ReactNode {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bgPrimary }}>
      {children}
      {/* Readiness marker for the simctl capture driver.
       *
       * It must be its OWN accessibility element, not an attribute of the
       * wrapper: iOS only exposes `testID` (as `accessibilityIdentifier`)
       * for nodes that are themselves accessibility elements, so a plain
       * container View never appears in `idb ui describe-all` at all —
       * which is exactly why the driver's readiness poll timed out
       * against a perfectly healthy app.
       *
       * It is also deliberately a SIBLING rather than `accessible` on the
       * wrapper. Marking the wrapper accessible does surface the marker,
       * but it collapses the whole subtree into one element (measured:
       * 41 accessibility nodes -> 3), which would blind the Maestro tier
       * to the scenario's own content.
       *
       * 1x1 and empty, so it paints nothing and cannot shift a golden. */}
      <View
        testID={ready ? "visual-ready" : "visual-pending"}
        accessible={true}
        accessibilityLabel={ready ? "visual-ready" : "visual-pending"}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
        }}
      />
    </View>
  );
}

interface SurfaceProps {
  readonly ready: boolean;
  readonly children: ReactNode;
}
