// `fonts.ts` imports each @fontsource stylesheet for its side effect (a bundler
// turns the import into an @font-face rule). The packages ship `.css` and no type
// declarations, which `tsc` reports as TS2882 for a side-effect import.
declare module "@fontsource/*";
