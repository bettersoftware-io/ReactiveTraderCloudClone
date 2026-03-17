import { createServer, httpListener } from "@marblejs/http";
import { r } from "@marblejs/http";
import { mapTo } from "rxjs/operators";

const health$ = r.pipe(
  r.matchPath("/health"),
  r.matchType("GET"),
  r.useEffect((req$) => req$.pipe(mapTo({ status: 200, body: { ok: true } }))),
);

const listener = httpListener({ effects: [health$] });

const server = createServer({ listener, port: 4000, hostname: "0.0.0.0" });

server.then((s) => s());
