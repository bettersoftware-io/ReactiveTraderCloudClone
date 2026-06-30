### Task 5 Report: Extract MountedComponent + MockWebSocket/FakeWs test doubles

**Files created:**
- `packages/client-react/tests/ui/contract/shared/harness/MountedComponent.ts` — `PageContext` interface + `MountedComponent` abstract class (verbatim copy of declarations from `component.ts` plus all their imports)
- `packages/client-react/src/app/adapters/MockWebSocket.testHelpers.ts` — `MockWebSocket` class + ESM live-binding `export let lastMock`. NOTE: `send` and `close` fields carry explicit `Mock` type annotation (imported from `vitest`) to satisfy TS2883 during declaration emit (`tsconfig.types.json` pulls in this file transitively via `WsAdapter.test.ts`)
- `packages/server/src/ws/FakeWs.testHelpers.ts` — `FakeWs extends EventEmitter` (verbatim body, changed to `export class`; biome auto-fixed `import { type WsMessage }` → `import type { WsMessage }`)

**Files modified:**
- `packages/client-react/tests/ui/contract/shared/harness/component.ts` — all original imports removed; new `import { MountedComponent, type PageContext } from "./MountedComponent.js"` + re-export; `ComponentToken`/`component()` remain unchanged
- `packages/client-react/src/app/adapters/WsAdapter.test.ts` — `let lastMock: MockWebSocket` line and `class MockWebSocket { … }` block removed; added `import { lastMock, MockWebSocket } from "./MockWebSocket.testHelpers"`
- `packages/server/src/ws/wsHandler.test.ts` — `import { EventEmitter } from "node:events"` removed (only used by FakeWs); `// ── Fake ws socket ──` banner + `class FakeWs { … }` block removed; added `import { FakeWs } from "./FakeWs.testHelpers.js"`
- `packages/server/vitest.config.ts` — added `"**/*.testHelpers.ts"` to `coverage.exclude`
- `packages/client-react/vitest.app.coverage.config.ts` — added `"**/*.testHelpers.ts"` to `coverage.exclude`

**component.ts importers:** The re-export (`export { MountedComponent, type PageContext }`) from `component.ts` preserves the public API for all existing importers. No importer files required editing — all 65 UI contract tests passed without touching a single page object file.

**Test suite results:**
- `pnpm --filter @rtc/client-react test:app` — 65 files, 294 tests PASSED
- `pnpm --filter @rtc/server test` — 3 files, 65 tests PASSED
- `pnpm --filter @rtc/client-react test:ui:contract` — 65 files, 406 tests PASSED
- `pnpm typecheck` — 9 tasks, 9 successful

**ESLint:**
- `pnpm exec eslint packages/client-react/tests/ui/contract/shared/harness/component.ts packages/client-react/tests/ui/contract/shared/harness/MountedComponent.ts packages/client-react/src/app/adapters/MockWebSocket.testHelpers.ts packages/server/src/ws/FakeWs.testHelpers.ts` → 0 errors
- `pnpm exec eslint packages/client-react/src/app/adapters/WsAdapter.test.ts packages/server/src/ws/wsHandler.test.ts` → 0 errors

**Biome:** `pnpm exec biome check --write <changed-files>` — checked 10 files, 1 auto-fix (import style in `FakeWs.testHelpers.ts`). Clean after fix.

**Notable deviation from brief:** `send: Mock = vi.fn()` and `close: Mock = vi.fn()` instead of bare `send = vi.fn()` / `close = vi.fn()`. The `Mock` import from `vitest` is required because `tsconfig.types.json` (with `emitDeclarationOnly: true`) picks up `MockWebSocket.testHelpers.ts` transitively (via `WsAdapter.test.ts` which IS in `include: ["src"]`). Without explicit `Mock` annotation, `vi.fn()` causes TS2883 ("cannot be named without a reference to 'Procedure' from '.pnpm/@vitest+spy@4.1.9/node_modules/...'"). The `Mock` type is a public vitest export, fully portable, and preserves the full spy API.
