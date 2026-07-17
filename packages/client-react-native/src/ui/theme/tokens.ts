import type { ThemeMode, ThemeSkin } from "@rtc/domain";

import {
  FONT_CHAKRA_DISPLAY,
  FONT_IBM_MONO,
  FONT_IBM_SANS,
  FONT_JETBRAINS_MONO,
} from "#/ui/theme/fontFamilies";

/**
 * Physical-depth descriptor for a skin cell. Flat skins use `level: 0` (no
 * shadow); the 3d skins fill it with a real drop shadow + elevation, a 1px
 * inset top-highlight colour, and an optional glow. RN cannot express the
 * web's layered/inset box-shadows, so this ports the dominant drop-shadow
 * layer (see packages/client-react/src/ui/shell/theme/tokens.ts --tile-shadow
 * / --panel-shadow / --glow) into RN-native shadow + elevation values.
 */
export interface DepthTokens {
  /** 0 = flat (no shadow/elevation); 2 = physical 3d. */
  readonly level: 0 | 2;
  /** iOS drop-shadow colour. */
  readonly shadowColor: string;
  /** iOS shadow opacity, 0..1. */
  readonly shadowOpacity: number;
  /** iOS shadow blur radius (px). */
  readonly shadowRadius: number;
  /** iOS shadow y-offset (px); x is always 0. */
  readonly shadowOffsetY: number;
  /** Android elevation (dp). */
  readonly elevation: number;
  /** 1px inset top-edge highlight (the web `--tile-shadow` inset layer); `null` = flat. */
  readonly topHighlight: string | null;
  /** Tile-surface vertical gradient `[top, bottom]` (the web `--tile`), giving the
   * tile a lit 3d face; `null` = flat (solid `bgTile`). */
  readonly tileGradient: readonly [string, string] | null;
  /** Optional header-strip vertical gradient `[top, bottom]` (the web
   * `--panel-head`) overlaid on the tile head — used where it reads as a subtle
   * tonal band (Terminal 3D's slate). `null` where a distinct head would clash
   * (Holo 3D's translucent-cyan panel-head looks garish over the teal tile). */
  readonly headGradient: readonly [string, string] | null;
  /** Glow colour for active/pressed elements; `null` = none. */
  readonly glow: string | null;
}

/**
 * The RN-native theme surface: the plain-colour subset of the web's CSS token
 * set (packages/client-react/src/ui/shell/theme/tokens.ts), camelCased, with all
 * `var()` refs pre-resolved. The FX keys (`gridC`/`aurora`/`glowC`) are now
 * populated, ported verbatim from `docs/design/mobile/v1/dev-handoff/theme-tokens.ts`
 * — they back the Skia ambient background (grid + aurora) and glow shadows. Font
 * fields hold a bundled family name (or `undefined` = RN system default, for
 * `classic`).
 */
export interface RnTheme {
  readonly bgPrimary: string;
  readonly bgSecondary: string;
  readonly bgHeader: string;
  readonly bgFooter: string;
  readonly bgTile: string;
  readonly bgOverlay: string;
  readonly bgBrandPrimary: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textOnAccent: string;

  readonly accentPositive: string;
  readonly accentNegative: string;
  readonly accentAware: string;
  readonly accentPrimary: string;
  readonly accent2: string;

  readonly borderPrimary: string;
  readonly borderSubtle: string;
  readonly border: string;
  readonly borderStrong: string;

  readonly statusConnected: string;
  readonly statusConnecting: string;
  readonly statusDisconnected: string;
  readonly statusError: string;

  readonly panel: string;
  readonly panelHead: string;
  readonly chip: string;

  /** Display font family, or `undefined` for the platform default (classic). */
  readonly fontDisplay: string | undefined;
  /** Mono font family, or `undefined` for the platform default (classic). */
  readonly fontMono: string | undefined;

  /** HUD grid line colour (the ambient background's faint grid overlay). */
  readonly gridC: string;
  /** Ambient background intensity, 0..1 (`classic` ≈ calmest, `neon`/`holo` brightest). */
  readonly aurora: number;
  /** Glow shadow colour for active/pressed elements and the ambient aurora; `null` = no glow. */
  readonly glowC: string | null;

  readonly depth: DepthTokens;
}

/** Flat skins carry no elevation — depthStyle() returns {} for level 0, so
 * these cells paint exactly as before this depth model existed. */
const FLAT_DEPTH: DepthTokens = {
  level: 0,
  shadowColor: "#000000",
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffsetY: 0,
  elevation: 0,
  topHighlight: null,
  tileGradient: null,
  headGradient: null,
  glow: null,
};

const classicDark: RnTheme = {
  bgPrimary: "#111827",
  bgSecondary: "#1f2937",
  bgHeader: "#0f172a",
  bgFooter: "#0f172a",
  bgTile: "#1e293b",
  bgOverlay: "rgba(0, 0, 0, 0.75)",
  bgBrandPrimary: "#3b82f6",
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  textOnAccent: "#fff",
  accentPositive: "#22c55e",
  accentNegative: "#ef4444",
  accentAware: "#f59e0b",
  accentPrimary: "#3b82f6",
  accent2: "#60a5fa",
  borderPrimary: "#334155",
  borderSubtle: "#1e293b",
  border: "#1e293b",
  borderStrong: "#475569",
  statusConnected: "#22c55e",
  statusConnecting: "#f59e0b",
  statusDisconnected: "#ef4444",
  statusError: "#d32f2f",
  panel: "rgba(30,41,59,0.92)",
  panelHead: "#1f2937",
  chip: "rgba(59,130,246,0.12)",
  fontDisplay: undefined,
  fontMono: undefined,
  gridC: "rgba(148,163,184,0.05)",
  aurora: 0.15,
  glowC: null,
  depth: FLAT_DEPTH,
};

const classicLight: RnTheme = {
  bgPrimary: "#f8fafc",
  bgSecondary: "#f1f5f9",
  bgHeader: "#ffffff",
  bgFooter: "#ffffff",
  bgTile: "#ffffff",
  bgOverlay: "rgba(0, 0, 0, 0.5)",
  bgBrandPrimary: "#2563eb",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  textOnAccent: "#fff",
  accentPositive: "#16a34a",
  accentNegative: "#dc2626",
  accentAware: "#d97706",
  accentPrimary: "#2563eb",
  accent2: "#60a5fa",
  borderPrimary: "#e2e8f0",
  borderSubtle: "#f1f5f9",
  border: "#f1f5f9",
  borderStrong: "#475569",
  statusConnected: "#16a34a",
  statusConnecting: "#d97706",
  statusDisconnected: "#dc2626",
  statusError: "#d32f2f",
  panel: "rgba(255,255,255,0.95)",
  panelHead: "#f1f5f9",
  chip: "rgba(59,130,246,0.12)",
  fontDisplay: undefined,
  fontMono: undefined,
  gridC: "rgba(15,23,42,0.03)",
  aurora: 0.1,
  glowC: null,
  depth: FLAT_DEPTH,
};

const holoDark: RnTheme = {
  bgPrimary: "#00060a",
  bgSecondary: "#02121d",
  bgHeader: "#02121d",
  bgFooter: "#02121d",
  bgTile: "rgba(6,26,38,0.5)",
  bgOverlay: "rgba(0,6,10,0.78)",
  bgBrandPrimary: "#00e5ff",
  textPrimary: "#d6f7ff",
  textSecondary: "rgba(150,210,228,0.62)",
  textMuted: "rgba(120,190,210,0.42)",
  textOnAccent: "#00060a",
  accentPositive: "#2bffb3",
  accentNegative: "#ff5d73",
  accentAware: "#ffb000",
  accentPrimary: "#00e5ff",
  accent2: "#19ffd0",
  borderPrimary: "rgba(0,224,255,0.26)",
  borderSubtle: "rgba(0,224,255,0.12)",
  border: "rgba(0,224,255,0.12)",
  borderStrong: "rgba(0,224,255,0.6)",
  statusConnected: "#2bffb3",
  statusConnecting: "#ffb000",
  statusDisconnected: "#ff5d73",
  statusError: "#ff5d73",
  panel: "rgba(6,26,38,0.85)",
  panelHead: "rgba(0,224,255,0.06)",
  chip: "rgba(0,224,255,0.12)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
  gridC: "rgba(0,224,255,0.05)",
  aurora: 0.6,
  glowC: "rgba(0,224,255,0.3)",
  depth: FLAT_DEPTH,
};

const holoLight: RnTheme = {
  bgPrimary: "#e8f9fd",
  bgSecondary: "#cdf1f9",
  bgHeader: "#ffffff",
  bgFooter: "#ffffff",
  bgTile: "rgba(200,240,250,0.7)",
  bgOverlay: "rgba(0,6,10,0.4)",
  bgBrandPrimary: "#00b4cc",
  textPrimary: "#002a35",
  textSecondary: "rgba(0,60,80,0.7)",
  textMuted: "rgba(0,60,80,0.45)",
  textOnAccent: "#ffffff",
  accentPositive: "#00c985",
  accentNegative: "#e8304a",
  accentAware: "#cc8800",
  accentPrimary: "#00b4cc",
  accent2: "#00cc9e",
  borderPrimary: "rgba(0,180,204,0.3)",
  borderSubtle: "rgba(0,180,204,0.15)",
  border: "rgba(0,180,204,0.15)",
  borderStrong: "rgba(0,180,204,0.65)",
  statusConnected: "#00c985",
  statusConnecting: "#cc8800",
  statusDisconnected: "#e8304a",
  statusError: "#e8304a",
  panel: "rgba(255,255,255,0.9)",
  panelHead: "rgba(0,180,204,0.08)",
  chip: "rgba(0,180,204,0.14)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
  gridC: "rgba(0,120,150,0.06)",
  aurora: 0.3,
  glowC: "rgba(0,180,204,0.25)",
  depth: FLAT_DEPTH,
};

// Holo 3D — the holo palette with real physical depth. Colours spread from the
// flat sibling; only bgTile is deepened and a depth block is filled. Depth
// values port the dominant layer of the web holo3d --tile-shadow/--glow.
// On dark skins a black drop shadow is invisible against the near-black page
// (bgPrimary #00060a). Depth here reads from (a) a lighter, more opaque raised
// tile surface, (b) a RESTING coloured glow in the skin's accent (cyan), and
// (c) a bright top highlight — the cues that actually show on dark. The web
// holo3d expresses the same "physical depth" with layered/inset shadows RN
// can't render, so this is the RN-native equivalent, tuned on-device.
const holo3dDark: RnTheme = {
  ...holoDark,
  bgTile: "#0c2634",
  glowC: "rgba(0,229,255,0.4)",
  depth: {
    level: 2,
    shadowColor: "#00e5ff",
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffsetY: 5,
    elevation: 8,
    topHighlight: "rgba(255,255,255,0.07)",
    tileGradient: ["rgba(18,52,68,0.95)", "rgba(10,30,43,0.88)"],
    headGradient: null,
    glow: "#00e5ff",
  },
};

const holo3dLight: RnTheme = {
  ...holoLight,
  bgTile: "#e9f4f7",
  glowC: "rgba(0,150,179,0.22)",
  depth: {
    level: 2,
    shadowColor: "rgba(20,60,80,0.5)",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffsetY: 6,
    elevation: 6,
    topHighlight: "rgba(255,255,255,0.9)",
    tileGradient: ["#ffffff", "#e9f4f7"],
    headGradient: null,
    glow: "rgba(0,150,179,0.22)",
  },
};

const terminalDark: RnTheme = {
  bgPrimary: "#0a0c10",
  bgSecondary: "#0e1116",
  bgHeader: "#0e1116",
  bgFooter: "#0e1116",
  bgTile: "#13161c",
  bgOverlay: "rgba(10,12,16,0.8)",
  bgBrandPrimary: "#ffb000",
  textPrimary: "#e8ebf1",
  textSecondary: "#8b93a1",
  textMuted: "#59616e",
  textOnAccent: "#0a0c10",
  accentPositive: "#37d27e",
  accentNegative: "#ff5b52",
  accentAware: "#ffb000",
  accentPrimary: "#ffb000",
  accent2: "#4a9eff",
  borderPrimary: "#262b34",
  borderSubtle: "#1a1e25",
  border: "#1a1e25",
  borderStrong: "#3a4351",
  statusConnected: "#37d27e",
  statusConnecting: "#ffb000",
  statusDisconnected: "#ff5b52",
  statusError: "#ff5b52",
  panel: "rgba(19,22,28,0.97)",
  panelHead: "#171b22",
  chip: "rgba(255,176,0,0.14)",
  fontDisplay: FONT_IBM_SANS,
  fontMono: FONT_IBM_MONO,
  gridC: "rgba(255,255,255,0.022)",
  aurora: 0.22,
  glowC: null,
  depth: FLAT_DEPTH,
};

const terminalLight: RnTheme = {
  bgPrimary: "#f4f5f7",
  bgSecondary: "#eaecef",
  bgHeader: "#ffffff",
  bgFooter: "#ffffff",
  bgTile: "#ffffff",
  bgOverlay: "rgba(10,12,16,0.35)",
  bgBrandPrimary: "#b37a00",
  textPrimary: "#12151c",
  textSecondary: "#3e4452",
  textMuted: "#6b7280",
  textOnAccent: "#ffffff",
  accentPositive: "#1fa856",
  accentNegative: "#d93a33",
  accentAware: "#b37a00",
  accentPrimary: "#b37a00",
  accent2: "#2e6db5",
  borderPrimary: "#c8cdd6",
  borderSubtle: "#e2e5ea",
  border: "#e2e5ea",
  borderStrong: "#9098a8",
  statusConnected: "#1fa856",
  statusConnecting: "#b37a00",
  statusDisconnected: "#d93a33",
  statusError: "#d93a33",
  panel: "rgba(255,255,255,0.97)",
  panelHead: "#f0f2f5",
  chip: "rgba(179,122,0,0.12)",
  fontDisplay: FONT_IBM_SANS,
  fontMono: FONT_IBM_MONO,
  gridC: "rgba(18,21,28,0.03)",
  aurora: 0.1,
  glowC: null,
  depth: FLAT_DEPTH,
};

// Terminal 3D — terminal palette + physical depth. Terminal's web --glow is
// "none", so glow stays null here (depth is drop-shadow + top highlight only).
// Terminal 3D dark: same dark-background problem as holo3d. The web terminal3d
// uses gradient panels (no neon glow) for depth, which RN can't fill; on a
// near-black page a black shadow is invisible, so this reads depth from a
// lighter raised slab, a bright top highlight, and a restrained amber
// under-glow in the terminal accent. (Deviates from the web's glow:none by
// necessity — the flat-black alternative is imperceptible on device.)
const terminal3dDark: RnTheme = {
  ...terminalDark,
  bgTile: "#161b22",
  depth: {
    level: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffsetY: 5,
    elevation: 8,
    topHighlight: "rgba(255,255,255,0.05)",
    tileGradient: ["#1f2530", "#161b22"],
    headGradient: ["#1c212a", "#14181e"],
    glow: null,
  },
};

const terminal3dLight: RnTheme = {
  ...terminalLight,
  bgTile: "#edf0f3",
  depth: {
    level: 2,
    shadowColor: "rgba(20,24,32,0.4)",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffsetY: 6,
    elevation: 6,
    topHighlight: "rgba(255,255,255,0.9)",
    tileGradient: ["#ffffff", "#edf0f3"],
    headGradient: ["#f2f4f6", "#e8ebef"],
    glow: null,
  },
};

const neonDark: RnTheme = {
  bgPrimary: "#070210",
  bgSecondary: "#12041f",
  bgHeader: "#12041f",
  bgFooter: "#12041f",
  bgTile: "rgba(28,6,46,0.52)",
  bgOverlay: "rgba(7,2,16,0.8)",
  bgBrandPrimary: "#ff2bd6",
  textPrimary: "#f7e9ff",
  textSecondary: "rgba(214,160,235,0.7)",
  textMuted: "rgba(180,120,210,0.45)",
  textOnAccent: "#070210",
  accentPositive: "#00ffa3",
  accentNegative: "#ff3864",
  accentAware: "#ffb000",
  accentPrimary: "#ff2bd6",
  accent2: "#00f0ff",
  borderPrimary: "rgba(255,43,214,0.36)",
  borderSubtle: "rgba(255,43,214,0.18)",
  border: "rgba(255,43,214,0.18)",
  borderStrong: "rgba(255,43,214,0.72)",
  statusConnected: "#00ffa3",
  statusConnecting: "#ffb000",
  statusDisconnected: "#ff3864",
  statusError: "#ff3864",
  panel: "rgba(28,6,46,0.88)",
  panelHead: "rgba(255,43,214,0.08)",
  chip: "rgba(255,43,214,0.14)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
  gridC: "rgba(255,43,214,0.07)",
  aurora: 0.7,
  glowC: "rgba(255,43,214,0.4)",
  depth: FLAT_DEPTH,
};

const neonLight: RnTheme = {
  bgPrimary: "#faf0fe",
  bgSecondary: "#f3e0fc",
  bgHeader: "#ffffff",
  bgFooter: "#ffffff",
  bgTile: "rgba(240,210,255,0.65)",
  bgOverlay: "rgba(7,2,16,0.35)",
  bgBrandPrimary: "#c800a0",
  textPrimary: "#1a0030",
  textSecondary: "rgba(80,10,120,0.75)",
  textMuted: "rgba(80,10,120,0.5)",
  textOnAccent: "#ffffff",
  accentPositive: "#00c97e",
  accentNegative: "#e8304a",
  accentAware: "#cc8800",
  accentPrimary: "#c800a0",
  accent2: "#00b8cc",
  borderPrimary: "rgba(200,0,160,0.3)",
  borderSubtle: "rgba(200,0,160,0.15)",
  border: "rgba(200,0,160,0.15)",
  borderStrong: "rgba(200,0,160,0.65)",
  statusConnected: "#00c97e",
  statusConnecting: "#cc8800",
  statusDisconnected: "#e8304a",
  statusError: "#e8304a",
  panel: "rgba(255,255,255,0.92)",
  panelHead: "rgba(200,0,160,0.08)",
  chip: "rgba(200,0,160,0.12)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
  gridC: "rgba(150,0,120,0.05)",
  aurora: 0.35,
  glowC: "rgba(200,0,160,0.25)",
  depth: FLAT_DEPTH,
};

export const rnThemeTokens: Record<ThemeSkin, Record<ThemeMode, RnTheme>> = {
  classic: { dark: classicDark, light: classicLight },
  holo: { dark: holoDark, light: holoLight },
  holo3d: { dark: holo3dDark, light: holo3dLight },
  terminal: { dark: terminalDark, light: terminalLight },
  terminal3d: { dark: terminal3dDark, light: terminal3dLight },
  neon: { dark: neonDark, light: neonLight },
};
