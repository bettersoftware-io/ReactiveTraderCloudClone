/** The accessibility id of the bare screen a visual-harness bundle shows at
 * the app's home route (`VisualHarnessHome.tsx`). Both capture drivers wait
 * for it before they open a scenario link. In a file of its own because the
 * drivers run on plain node, which cannot import a React Native component. */
export const VISUAL_HARNESS_HOME_ID = "visual-harness-home";
