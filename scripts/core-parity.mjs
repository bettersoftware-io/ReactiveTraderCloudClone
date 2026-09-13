#!/usr/bin/env node
// Prints both alternative cores' parity manifests as one table, for PR
// descriptions and docs/STATUS.md.
import { readFileSync } from "node:fs";

const CORES = ["client-core-async", "client-core-effect"];
const manifests = CORES.map((dir) =>
  JSON.parse(readFileSync(`packages/${dir}/src/parity.json`, "utf8")),
);
const rows = [];
for (const section of ["presenters", "machines"]) {
  for (const member of Object.keys(manifests[0][section])) {
    rows.push({
      member: `${section}.${member}`,
      async: manifests[0][section][member],
      effect: manifests[1][section][member],
    });
  }
}
const native = (m) =>
  Object.values({ ...m.presenters, ...m.machines }).filter(
    (v) => v === "native",
  ).length;
console.table(rows);
console.log(
  `native: async ${native(manifests[0])}/${rows.length}, effect ${native(manifests[1])}/${rows.length}`,
);
