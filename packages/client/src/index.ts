export {
  createApp,
  buildDefaultPorts,
  type App,
  type Presenters,
  type AppPorts,
} from "./app/composition";
export {
  createSimulatorPorts,
  createWsRealPorts,
} from "./app/adapters/portFactory";
