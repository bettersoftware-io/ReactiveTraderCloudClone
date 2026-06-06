// Single import surface for runner specs. Specs import VisualScenario from
// "@ui-harness"; a future Solid harness re-points the alias to visual/solid
// and exposes the same barrel, so no spec file changes on a framework swap.
export { VisualScenario } from "./VisualScenario";
