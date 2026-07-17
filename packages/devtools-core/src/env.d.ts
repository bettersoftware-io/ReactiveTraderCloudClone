// Type-only ambient for the single Vite-provided constant devtools-core reads:
// `import.meta.env.DEV`. It gates the intent-injection handler so a production
// bundle dead-code-eliminates that branch (see DevtoolsHub.attachTransport).
// devtools-core is a tsc-built leaf without `vite/client` types, so declare
// exactly the surface used — no runtime dependency on Vite. This file emits
// nothing and is not referenced by the package's public .d.ts, so the global
// augmentation never leaks to consumers.

interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
