import type { ThemeMode, ThemeSkin } from "@rtc/domain";

import {
  FONT_CHAKRA_DISPLAY,
  FONT_IBM_MONO,
  FONT_IBM_SANS,
  FONT_JETBRAINS_MONO,
} from "#/ui/theme/fontFamilies";

/**
 * The RN-native theme surface: the plain-colour subset of the web's CSS token
 * set (packages/client-react/src/ui/shell/theme/tokens.ts), camelCased, with all
 * `var()` refs pre-resolved and the CSS-only FX keys (blur/glow/grid/aurora)
 * dropped — those belong to the deferred animation phase. Font fields hold a
 * bundled family name (or `undefined` = RN system default, for `classic`).
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
}

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
  panel: "#1e293b",
  panelHead: "#1f2937",
  chip: "rgba(59,130,246,0.12)",
  fontDisplay: undefined,
  fontMono: undefined,
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
  panel: "#ffffff",
  panelHead: "#f1f5f9",
  chip: "rgba(59,130,246,0.12)",
  fontDisplay: undefined,
  fontMono: undefined,
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
  panel: "rgba(6,26,38,0.5)",
  panelHead: "rgba(0,224,255,0.06)",
  chip: "rgba(0,224,255,0.12)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
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
  panel: "rgba(200,240,250,0.7)",
  panelHead: "rgba(0,180,204,0.08)",
  chip: "rgba(0,180,204,0.14)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
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
  panel: "#13161c",
  panelHead: "#171b22",
  chip: "rgba(255,176,0,0.14)",
  fontDisplay: FONT_IBM_SANS,
  fontMono: FONT_IBM_MONO,
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
  panel: "#ffffff",
  panelHead: "#f0f2f5",
  chip: "rgba(179,122,0,0.12)",
  fontDisplay: FONT_IBM_SANS,
  fontMono: FONT_IBM_MONO,
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
  panel: "rgba(28,6,46,0.52)",
  panelHead: "rgba(255,43,214,0.08)",
  chip: "rgba(255,43,214,0.14)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
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
  panel: "rgba(240,210,255,0.65)",
  panelHead: "rgba(200,0,160,0.08)",
  chip: "rgba(200,0,160,0.12)",
  fontDisplay: FONT_CHAKRA_DISPLAY,
  fontMono: FONT_JETBRAINS_MONO,
};

export const rnThemeTokens: Record<ThemeSkin, Record<ThemeMode, RnTheme>> = {
  classic: { dark: classicDark, light: classicLight },
  holo: { dark: holoDark, light: holoLight },
  terminal: { dark: terminalDark, light: terminalLight },
  neon: { dark: neonDark, light: neonLight },
};
