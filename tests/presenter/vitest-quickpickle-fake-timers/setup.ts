// tests/presenter/vitest-quickpickle-fake-timers/setup.ts
// Loaded once via vitest setupFiles. Side-effect order matters:
//   1. world.ts installs setWorldConstructor
//   2. hooks.ts registers Before/After
//   3. step files register Given/When/Then matchers

import "./hooks";
import "./steps/adminIncident.steps";
import "./steps/analytics.steps";
import "./steps/blotter.steps";
import "./steps/common.steps";
import "./steps/connection.steps";
import "./steps/creditRfq.steps";
import "./steps/fxLiveRates.steps";
import "./steps/fxRfq.steps";
import "./steps/fxTrading.steps";
import "./world";
