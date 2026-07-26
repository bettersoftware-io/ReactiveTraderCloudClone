// packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import {
  type SkFont,
  Skia,
  type SkTypeface,
  useFont,
} from "@shopify/react-native-skia";
import { useMemo } from "react";

/**
 * The boot scenes' text typefaces, and the per-site fonts built from them.
 *
 * **Why this module exists.** Every boot scene used to build its text font as
 * a bare `Skia.Font()` inside the draw worklet. On real iOS that font carries
 * NO typeface, and Skia then draws zero glyphs — silently, with no throw and
 * no warning. The status banner and the ~20 docking readouts have therefore
 * never rendered on a device, and the jest mock could not tell anyone: it
 * stubs `Skia.Font()` as an object with the right methods, so the draw call
 * "succeeds". The pinned goldens captured that absence as correct.
 *
 * `Skia.Font()` genuinely does not resolve a platform default. The reason the
 * no-argument form was reached for at all is that the obvious alternative,
 * `Skia.Font(undefined, size)`, throws `Value is undefined, expected an
 * Object` on device — which reads as "the no-arg form is the supported way to
 * get the default face". It isn't; there is no default face.
 *
 * **The font.** JetBrains Mono, matching the web boot canvas's stack
 * (`'JetBrains Mono','IBM Plex Mono',monospace` — `bootCanvas.ts`). It is
 * already a dependency and already bundled for the app's own type ramp
 * (`ui/theme/fonts.ts`), so this adds no new asset. Loading the real 700 face
 * rather than synthesising weight also closes the separate documented gap
 * where the web's `bold 12px`/`bold 13px`/`bold 18px` sites rendered regular.
 *
 * Bundled rather than system-matched (`Skia.FontMgr.System()`) on purpose:
 * the pixels are pinned as visual goldens, and a system face would drift with
 * the OS version underneath them.
 *
 * **Build-once, not per-frame.** `Skia.Font` is a host-object factory. Every
 * export here is deliberately UNMARKED — none may be called from inside a
 * worklet. Scenes build their fonts in React-land and capture the result in
 * the draw closure, the same shape `DockingScene`'s `useMemo`'d `SkPath`
 * already uses. Adding `"worklet"` to make a per-frame call legal would
 * reintroduce exactly the per-frame allocation this avoids.
 */
export interface BootFontSpec {
  readonly size: number;
  /** Sites the web renders with a `bold` weight prefix. Loads the real 700
   * face; Skia's `setEmbolden` synthesis is not used. */
  readonly bold?: boolean;
}

/**
 * Builds one `SkFont` per named spec, or `null` until both faces have loaded.
 *
 * Takes the whole spec map at once (rather than exposing a per-size hook)
 * because the two `useFont` calls below must run an identical number of times
 * on every render. Pass a module-level constant, so the memo's identity is
 * stable across renders.
 *
 * Consumers must handle the `null` window: the asset load is asynchronous, so
 * the first frames of a scene have geometry but no text. Scenes draw their
 * non-text layers regardless and skip only the text — for the live boot
 * splash that is a sub-frame gap, and the visual harness gates its readiness
 * marker on this hook so a golden can never capture the text-less window.
 */
export function useBootSceneFonts<Spec extends Record<string, BootFontSpec>>(
  specs: Spec,
): Readonly<Record<keyof Spec, SkFont>> | null {
  const regular = useFont(JetBrainsMono_400Regular, TYPEFACE_PROBE_SIZE);
  const bold = useFont(JetBrainsMono_700Bold, TYPEFACE_PROBE_SIZE);
  return useMemo(() => {
    return buildSceneFonts(specs, regular, bold);
  }, [specs, regular, bold]);
}

/** Size handed to the two loader hooks. Irrelevant to what gets drawn — only
 * the typeface is kept, and each spec re-sizes it — but `useFont` requires
 * some size, so it is named rather than left as a bare literal. */
const TYPEFACE_PROBE_SIZE = 12;

function buildSceneFonts<Spec extends Record<string, BootFontSpec>>(
  specs: Spec,
  regular: SkFont | null,
  bold: SkFont | null,
): Readonly<Record<keyof Spec, SkFont>> | null {
  const regularFace = regular?.getTypeface() ?? null;
  const boldFace = bold?.getTypeface() ?? null;

  if (regularFace === null || boldFace === null) {
    return null;
  }

  const fonts = {} as Record<keyof Spec, SkFont>;

  for (const key of Object.keys(specs) as (keyof Spec)[]) {
    fonts[key] = buildFont(specs[key], regularFace, boldFace);
  }

  return fonts;
}

function buildFont(
  spec: BootFontSpec,
  regularFace: SkTypeface,
  boldFace: SkTypeface,
): SkFont {
  return Skia.Font(spec.bold === true ? boldFace : regularFace, spec.size);
}
