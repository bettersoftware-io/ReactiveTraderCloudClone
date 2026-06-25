# Golden fixtures (ground truth from the original)

Each `<name>.original.json` pins the **original** ReactiveTraderCloud's actual
output for a pure function, so the clone's reimplementation is verified against
ground truth rather than a hand-typed number.

Shape:
```json
{ "_source": "rtc-original@4a31f01 <path/file.ts:line>", "cases": [ { "input": ..., "expected": ... } ] }
```

- `_source` MUST cite the original commit (`4a31f01`) and the file:line the
  expected values were derived from.
- Load with `loadGolden(name)` from `../__testUtils__/loadGolden.js` (domain helper).
- Client-side fixtures live under `packages/client-react/tests/ui/__golden__/` and use
  the client-react `loadGolden` from `#tests/ui/__golden__/loadGolden`.
