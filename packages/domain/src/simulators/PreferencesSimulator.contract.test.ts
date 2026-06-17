import { describePreferencesPortContract } from "../ports/__contracts__/PreferencesPortContract.js";
import { PreferencesSimulator } from "./PreferencesSimulator.js";

describePreferencesPortContract(
  "PreferencesSimulator",
  () => new PreferencesSimulator(),
  (seed) => new PreferencesSimulator(seed),
);
