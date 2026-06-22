import { describePreferencesPortContract } from "../ports/__contracts__/PreferencesPortContract.js";
import { PreferencesSimulator } from "./PreferencesSimulator.js";

describePreferencesPortContract(
  "PreferencesSimulator",
  () => {
    return new PreferencesSimulator();
  },
  (seed) => {
    return new PreferencesSimulator(seed);
  },
);
