import type {
  AnalyticsPort,
  BlotterPort,
  Direction,
  ExecutionPort,
  PricingPort,
  ReferenceDataPort,
  ServiceHealthPort,
} from "@rtc/domain";

/** One framework-neutral desk tool: JSON Schema in, JSON-serializable result
 * out. SDK-free by design — the server's AnthropicAgentLoop adapts these to
 * the SDK's betaTool form; tests drive `run` directly against simulators. */
export interface JarvisToolDefinition {
  readonly name: string;
  readonly description: string;
  /** Raw JSON Schema (object type, additionalProperties: false, required listed). */
  readonly inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<string>;
}

export interface JarvisConfirmDetails {
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly quotedPrice: number;
  readonly ratePrecision: number;
}

/** Injected human-in-the-loop gate: resolves true (approved) or false
 * (declined/timeout). The server session wires this to the existing
 * JARVIS_CONFIRM_REQUEST/JARVIS_CONFIRM round-trip. */
export type ConfirmGate = (details: JarvisConfirmDetails) => Promise<boolean>;

export interface JarvisToolDeps {
  readonly referenceData: ReferenceDataPort;
  readonly pricing: PricingPort;
  readonly blotter: BlotterPort;
  readonly analytics: AnalyticsPort;
  readonly execution: ExecutionPort;
  readonly serviceHealth: ServiceHealthPort;
  readonly confirmTrade: ConfirmGate;
}
