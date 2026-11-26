// Point-in-time check of the swing rules on the whole IDX universe.
// Each day the universe is the 150 names with the highest average traded value over the
// previous 60 sessions, known that day (no hindsight about which names became busy later).
// Also run with non-overlapping signal dates (every 5th trading day) for honest t values.
// Needs research/data/all-daily.json from fetch-all-daily.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { study, NOTE } from "./swing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { daily } = JSON.parse(readFileSync(process.argv[2] ?? join(here, "data", "all-daily.json")));
const TOP = 150, LOOKBACK = 60;

// value[d] = [[symbol, trailing 60-day average value]] for every date
const byDate = new Map();
for (const [s, b] of Object.entries(daily)) {
  let sum = 0;
  b.forEach((x, i) => {
    sum += x.v * x.c;
    if (i >= LOOKBACK) sum -= b[i - LOOKBACK].v * b[i - LOOKBACK].c;
    if (i >= LOOKBACK - 1) { if (!byDate.has(x.d)) byDate.set(x.d, []); byDate.get(x.d).push([s, sum / LOOKBACK]); }
  });
}
const top = new Map([...byDate].map(([d, a]) => [d, new Set(a.sort((p, q) => q[1] - p[1]).slice(0, TOP).map(([s]) => s))]));
const eligible = (s, d) => top.get(d)?.has(s) ?? false;
const members = new Set([...top.values()].flatMap((x) => [...x]));
const sub = Object.fromEntries([...members].map((s) => [s, daily[s]]));
console.log(`${Object.keys(daily).length} saham dibaca; ${members.size} pernah masuk 150 terlikuid harian`);
study("pit_150 (semua tanggal)", sub, { eligible });
study("pit_150 (tiap 5 hari bursa, tanpa tumpang tindih)", sub, { eligible, every: 5 });
console.log(NOTE);
