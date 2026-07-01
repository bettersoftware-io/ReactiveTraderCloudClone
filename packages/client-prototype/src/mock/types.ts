export type Skin = "holo" | "holo3d" | "terminal" | "terminal3d" | "neon";

export type Mode = "dark" | "light";

export interface ThemeTokens {
  bg: string;
  bg2: string;
  panel: string;
  panelHead: string;
  border: string;
  borderStrong: string;
  text: string;
  dim: string;
  faint: string;
  accent: string;
  accent2: string;
  buy: string;
  sell: string;
  glow: string;
  grid: string;
  chip: string;
  auroraOp: string;
  tile: string;
  tileShadow: string;
  fontD: string;
  fontM: string;
  /** Only the *3d skins define a separate panel shadow. */
  panelShadow?: string;
}

export interface User {
  name: string;
  initials: string;
  role: string;
  email: string;
  desk: string;
  id: string;
}

export interface Language {
  code: string;
  label: string;
}

export interface Notif {
  t: string;
  tag: string;
  msg: string;
  color: string;
}

export interface StatusItem {
  label: string;
  value: string;
  color: string;
}
