/**
 * The accessibility tree `idb` returns for a simulator that Maestro has
 * driven: the app's `Application` node and nothing under it.
 *
 * Measured 2026-10-11 on the iPhone 17 simulator (iOS 26.5): after ONE Maestro
 * flow, with the app on screen at the harness home, `idb ui describe-all`
 * returns that single node where a fresh simulator returns the marker too.
 * Stopping Maestro's driver app does not bring the elements back, nor does
 * restarting `idb_companion`; rebooting the simulator does. Until then every
 * simctl capture times out on a screen that is in fact ready.
 */

/** The fields of an `idb ui describe-all` node this reads. */
interface AxNode {
  readonly role: string | null;
}

/** True when the tree is one `Application` node with no element under it. */
export function isBareApplicationTree(tree: readonly AxNode[]): boolean {
  return tree.length === 1 && tree[0]?.role === "AXApplication";
}

/** What to tell whoever ran the capture. `udid` goes into the commands. */
export function describeBareApplication(udid: string): string {
  return (
    "idb sees the app but none of its elements. That is what a Maestro run " +
    "leaves behind on a simulator, and it lasts until the simulator is " +
    `rebooted: \`xcrun simctl shutdown ${udid} && xcrun simctl boot ${udid}\`, ` +
    "then run this tier again."
  );
}
