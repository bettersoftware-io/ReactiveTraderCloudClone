// cypress-mochawesome-reporter ships no types for its /plugin entry
// (package.json "types" covers only the root). Minimal ambient declaration
// for the one shape we use in cypress.config.ts: default-export plugin
// registering node-event listeners.
declare module "cypress-mochawesome-reporter/plugin" {
  const plugin: (on: Cypress.PluginEvents) => void;
  export default plugin;
}
