import type { JarvisPort } from "@rtc/core-api";
import { ScriptedJarvisEngine } from "@rtc/shared";

/**
 * Thin client-adapters shim over the transport-neutral `ScriptedJarvisEngine`
 * (relocated to `@rtc/shared` so the server's phase-2 `ScriptedAgentLoop` can
 * share the same brain). Every existing import site — `portFactory`,
 * `ui-contract`, this package's own tests — keeps resolving
 * `ScriptedJarvisAdapter` from `@rtc/client-adapters` unchanged; this class adds
 * nothing but the `JarvisPort` structural marker.
 */
export class ScriptedJarvisAdapter
  extends ScriptedJarvisEngine
  implements JarvisPort {}
