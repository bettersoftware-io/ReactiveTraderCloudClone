export interface TierResult {
  tier: string;
  passed: number;
  failed: number;
  skipped: number;
}

export function summarize(tier: string, json: unknown): TierResult {
  const j = (json ?? {}) as Record<string, number | undefined>;
  return {
    tier,
    passed: j.numPassedTests ?? 0,
    failed: j.numFailedTests ?? 0,
    skipped: j.numPendingTests ?? 0,
  };
}
