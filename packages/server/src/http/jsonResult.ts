export interface HttpResult {
  readonly status: number;
  readonly body: string;
  readonly headers?: Record<string, string>;
}

const JSON_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
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
    headers: { ...JSON_CORS_HEADERS, ...extraHeaders },
  };
}
