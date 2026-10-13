export interface HttpResult {
  readonly status: number;
  readonly body: string;
  readonly headers?: Record<string, string>;
}

/** The router, not this helper, adds the CORS headers: which origin a
 * browser may use these routes from is the router's policy (spec §3.1). */
const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

export function jsonResult(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): HttpResult {
  return {
    status,
    body: JSON.stringify(body),
    headers: { ...JSON_HEADERS, ...extraHeaders },
  };
}
