// tests/support/presenter/vitest-fake/setup.ts
// Loaded once via vitest setupFiles. Side-effect order matters:
//   1. world.ts installs setWorldConstructor
//   2. hooks.ts registers Before/After
//   3. step files register Given/When/Then matchers
import "./world";
import "./hooks";
import "../../../steps/presenter/vitest-fake/connection.steps";
import "../../../steps/presenter/vitest-fake/fxLiveRates.steps";
import "../../../steps/presenter/vitest-fake/fxTrading.steps";
import "../../../steps/presenter/vitest-fake/blotter.steps";
import "../../../steps/presenter/vitest-fake/analytics.steps";
import "../../../steps/presenter/vitest-fake/fxRfq.steps";
import "../../../steps/presenter/vitest-fake/creditRfq.steps";
import "../../../steps/presenter/vitest-fake/common.steps";
