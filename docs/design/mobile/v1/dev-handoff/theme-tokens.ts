// Reactive Trader Mobile — theme tokens (mobile-v1)
// Drop-in extension for packages/client-react-native/src/ui/theme/tokens.ts
// Shape: one ThemeTokens object per (theme × mode). 6 themes × dark/light = 12 sets.

export interface ThemeTokens {
  bg: string;        // screen background
  bg2: string;       // secondary background
  head: string;      // header / dock background
  tile: string;      // tile & card surface (flat themes)
  overlay: string;   // modal scrim
  text: string;
  dim: string;       // secondary text
  faint: string;     // tertiary text / hairlines text
  onAcc: string;     // text on accent fills
  pos: string;       // buy / up
  neg: string;       // sell / down
  aware: string;     // warning / pending
  acc: string;       // primary accent
  acc2: string;      // secondary accent
  border: string;
  bSub: string;      // subtle border
  bStrong: string;   // strong border
  panel: string;     // sheet/panel surface (translucent in holo/neon → pair with blur)
  pHead: string;     // panel header tint
  chip: string;      // chip / selected tint
  fD: string;        // display font family
  fM: string;        // mono font family
  glowC: string | null;             // glow shadow color (null = no glow)
  tileGrad: [string, string] | null; // 3D themes: vertical gradient stops for tiles
  topHi: string | null;             // 3D themes: inner top highlight
  shadow: string | null;            // 3D themes: drop shadow (CSS shorthand reference)
  gridC: string;     // HUD grid line color
  aurora: number;    // ambient background intensity 0..1
}

// Font family references — load via expo-font:
// holo/neon: 'ChakraPetch' + 'JetBrainsMono'; terminal: 'IBMPlexSans' + 'IBMPlexMono';
// wordmark: 'Orbitron'; classic: system defaults.
const F = {
  sysD: 'System', sysM: 'Menlo',
  ch: 'ChakraPetch', jb: 'JetBrainsMono',
  ps: 'IBMPlexSans', pm: 'IBMPlexMono',
};

const holoDark: ThemeTokens = { bg: '#00060a', bg2: '#02121d', head: '#02121d', tile: 'rgba(6,26,38,0.5)', overlay: 'rgba(0,6,10,0.78)', text: '#d6f7ff', dim: 'rgba(150,210,228,0.62)', faint: 'rgba(120,190,210,0.42)', onAcc: '#00060a', pos: '#2bffb3', neg: '#ff5d73', aware: '#ffb000', acc: '#00e5ff', acc2: '#19ffd0', border: 'rgba(0,224,255,0.26)', bSub: 'rgba(0,224,255,0.12)', bStrong: 'rgba(0,224,255,0.6)', panel: 'rgba(6,26,38,0.85)', pHead: 'rgba(0,224,255,0.06)', chip: 'rgba(0,224,255,0.12)', fD: F.ch, fM: F.jb, glowC: 'rgba(0,224,255,0.3)', tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(0,224,255,0.05)', aurora: 0.6 };
const holoLight: ThemeTokens = { bg: '#e8f9fd', bg2: '#cdf1f9', head: '#ffffff', tile: 'rgba(255,255,255,0.75)', overlay: 'rgba(0,6,10,0.4)', text: '#002a35', dim: 'rgba(0,60,80,0.7)', faint: 'rgba(0,60,80,0.45)', onAcc: '#ffffff', pos: '#00c985', neg: '#e8304a', aware: '#cc8800', acc: '#00b4cc', acc2: '#00cc9e', border: 'rgba(0,180,204,0.3)', bSub: 'rgba(0,180,204,0.15)', bStrong: 'rgba(0,180,204,0.65)', panel: 'rgba(255,255,255,0.9)', pHead: 'rgba(0,180,204,0.08)', chip: 'rgba(0,180,204,0.14)', fD: F.ch, fM: F.jb, glowC: 'rgba(0,180,204,0.25)', tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(0,120,150,0.06)', aurora: 0.3 };

const holo3dDark: ThemeTokens = { ...holoDark, tile: '#0c2634', tileGrad: ['rgba(18,52,68,0.95)', 'rgba(10,30,43,0.88)'], topHi: 'rgba(255,255,255,0.07)', shadow: '0 5px 9px rgba(0,229,255,0.14)', glowC: 'rgba(0,229,255,0.4)' };
const holo3dLight: ThemeTokens = { ...holoLight, tile: '#e9f4f7', tileGrad: ['#ffffff', '#e9f4f7'], topHi: 'rgba(255,255,255,0.9)', shadow: '0 6px 10px rgba(20,60,80,0.18)', glowC: 'rgba(0,150,179,0.22)' };

const terminalDark: ThemeTokens = { bg: '#0a0c10', bg2: '#0e1116', head: '#0e1116', tile: '#13161c', overlay: 'rgba(10,12,16,0.8)', text: '#e8ebf1', dim: '#8b93a1', faint: '#59616e', onAcc: '#0a0c10', pos: '#37d27e', neg: '#ff5b52', aware: '#ffb000', acc: '#ffb000', acc2: '#4a9eff', border: '#262b34', bSub: '#1a1e25', bStrong: '#3a4351', panel: 'rgba(19,22,28,0.97)', pHead: '#171b22', chip: 'rgba(255,176,0,0.14)', fD: F.ps, fM: F.pm, glowC: null, tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(255,255,255,0.022)', aurora: 0.22 };
const terminalLight: ThemeTokens = { bg: '#f4f5f7', bg2: '#eaecef', head: '#ffffff', tile: '#ffffff', overlay: 'rgba(10,12,16,0.35)', text: '#12151c', dim: '#3e4452', faint: '#6b7280', onAcc: '#ffffff', pos: '#1fa856', neg: '#d93a33', aware: '#b37a00', acc: '#b37a00', acc2: '#2e6db5', border: '#c8cdd6', bSub: '#e2e5ea', bStrong: '#9098a8', panel: 'rgba(255,255,255,0.97)', pHead: '#f0f2f5', chip: 'rgba(179,122,0,0.12)', fD: F.ps, fM: F.pm, glowC: null, tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(18,21,28,0.03)', aurora: 0.1 };

const terminal3dDark: ThemeTokens = { ...terminalDark, tile: '#161b22', tileGrad: ['#1f2530', '#161b22'], topHi: 'rgba(255,255,255,0.05)', shadow: '0 5px 8px rgba(0,0,0,0.5)' };
const terminal3dLight: ThemeTokens = { ...terminalLight, tile: '#edf0f3', tileGrad: ['#ffffff', '#edf0f3'], topHi: 'rgba(255,255,255,0.9)', shadow: '0 6px 10px rgba(20,24,32,0.16)' };

const neonDark: ThemeTokens = { bg: '#070210', bg2: '#12041f', head: '#12041f', tile: 'rgba(28,6,46,0.52)', overlay: 'rgba(7,2,16,0.8)', text: '#f7e9ff', dim: 'rgba(214,160,235,0.7)', faint: 'rgba(180,120,210,0.45)', onAcc: '#070210', pos: '#00ffa3', neg: '#ff3864', aware: '#ffb000', acc: '#ff2bd6', acc2: '#00f0ff', border: 'rgba(255,43,214,0.36)', bSub: 'rgba(255,43,214,0.18)', bStrong: 'rgba(255,43,214,0.72)', panel: 'rgba(28,6,46,0.88)', pHead: 'rgba(255,43,214,0.08)', chip: 'rgba(255,43,214,0.14)', fD: F.ch, fM: F.jb, glowC: 'rgba(255,43,214,0.4)', tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(255,43,214,0.07)', aurora: 0.7 };
const neonLight: ThemeTokens = { bg: '#faf0fe', bg2: '#f3e0fc', head: '#ffffff', tile: 'rgba(255,255,255,0.72)', overlay: 'rgba(7,2,16,0.35)', text: '#1a0030', dim: 'rgba(80,10,120,0.75)', faint: 'rgba(80,10,120,0.5)', onAcc: '#ffffff', pos: '#00c97e', neg: '#e8304a', aware: '#cc8800', acc: '#c800a0', acc2: '#00b8cc', border: 'rgba(200,0,160,0.3)', bSub: 'rgba(200,0,160,0.15)', bStrong: 'rgba(200,0,160,0.65)', panel: 'rgba(255,255,255,0.92)', pHead: 'rgba(200,0,160,0.08)', chip: 'rgba(200,0,160,0.12)', fD: F.ch, fM: F.jb, glowC: 'rgba(200,0,160,0.25)', tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(150,0,120,0.05)', aurora: 0.35 };

const classicDark: ThemeTokens = { bg: '#111827', bg2: '#1f2937', head: '#0f172a', tile: '#1e293b', overlay: 'rgba(0,0,0,0.75)', text: '#f1f5f9', dim: '#94a3b8', faint: '#64748b', onAcc: '#ffffff', pos: '#22c55e', neg: '#ef4444', aware: '#f59e0b', acc: '#3b82f6', acc2: '#60a5fa', border: '#334155', bSub: '#1e293b', bStrong: '#475569', panel: 'rgba(30,41,59,0.92)', pHead: '#1f2937', chip: 'rgba(59,130,246,0.12)', fD: F.sysD, fM: F.sysM, glowC: null, tileGrad: null, topHi: null, shadow: null, gridC: 'rgba(148,163,184,0.05)', aurora: 0.15 };
const classicLight: ThemeTokens = { bg: '#f8fafc', bg2: '#f1f5f9', head: '#ffffff', tile: '#ffffff', overlay: 'rgba(0,0,0,0.5)', text: '#0f172a', dim: '#475569', faint: '#94a3b8', onAcc: '#ffffff', pos: '#16a34a', neg: '#dc2626', aware: '#d97706', acc: '#2563eb', acc2: '#60a5fa', border: '#e2e8f0', bSub: '#f1f5f9', bStrong: '#94a3b8', panel: 'rgba(255,255,255,0.95)', pHead: '#f1f5f9', chip: 'rgba(59,130,246,0.12)', fD: F.sysD, fM: F.sysM, glowC: null, tileGrad: null, topHi: null, shadow: '0 4px 10px rgba(15,23,42,0.08)', gridC: 'rgba(15,23,42,0.03)', aurora: 0.1 };

export type ThemeKey = 'holo' | 'holo3d' | 'terminal' | 'terminal3d' | 'neon' | 'classic';
export type ThemeMode = 'dark' | 'light';

export const THEMES: Record<ThemeKey, { name: string; dark: ThemeTokens; light: ThemeTokens }> = {
  holo: { name: 'HOLO HUD', dark: holoDark, light: holoLight },
  holo3d: { name: 'HOLO 3D', dark: holo3dDark, light: holo3dLight },
  terminal: { name: 'TERMINAL', dark: terminalDark, light: terminalLight },
  terminal3d: { name: 'TERMINAL 3D', dark: terminal3dDark, light: terminal3dLight },
  neon: { name: 'NEON', dark: neonDark, light: neonLight },
  classic: { name: 'CLASSIC', dark: classicDark, light: classicLight },
};
