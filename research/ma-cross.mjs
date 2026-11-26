// MA10 crossing above MA20: today's list, and how well a Stockbit-style snapshot catches it.
// A Stockbit screener compares today's values only (no "yesterday's MA" field), so the cross is
// approximated as: MA10 > MA20, MA10 <= 1.02 x MA20 (the lines are still close), Price > MA10.
// This script measures how often that snapshot is a fresh cross (within the last 1 / 3 / 5 days).
// Usage: node research/ma-cross.mjs [path to all-daily.json]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, "data", "all-daily.json");
let daily = {};
try { daily = JSON.parse(readFileSync(file)).daily ?? {}; } catch {}
if (Object.keys(daily).length === 0) {
  console.error(`Data harian kosong atau belum ada di ${file}.`);
  console.error(`Ambil dulu: IHSG_API=https://ihsg-api.denyfarras.workers.dev/api node research/fetch-all-daily.mjs`);
  process.exit(1);
}
const MIN_VALUE = 10e9; // average traded value over 20 days, rupiah
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

const last = Object.values(daily).map((b) => b.at(-1)?.d).sort().at(-1);
const exact = [], snap = [];
let snapN = 0, fresh1 = 0, fresh3 = 0, fresh5 = 0, crossN = 0, caught = 0;

for (const [s, b] of Object.entries(daily)) {
  if (b.length < 60) continue;
  const cl = b.map((x) => x.c);
  const ma = (i, n) => mean(cl.slice(i - n + 1, i + 1));
  const above = (i) => ma(i, 10) > ma(i, 20);
  for (let t = 40; t < b.length; t++) {
    const val20 = mean(b.slice(t - 19, t + 1).map((y) => y.v * y.c));
    if (val20 < MIN_VALUE) continue;
    const m10 = ma(t, 10), m20 = ma(t, 20), c = cl[t];
    const isCross = above(t) && !above(t - 1);
    const isSnap = m10 > m20 && m10 <= m20 * 1.02 && c > m10;
    // age of the current MA10 > MA20 run, in days (0 = crossed today)
    let age = -1;
    if (above(t)) { age = 0; while (age < 30 && above(t - age - 1)) age++; }
    if (isCross) { crossN++; if (isSnap) caught++; }
    if (isSnap) { snapN++; if (age <= 0) fresh1++; if (age <= 2) fresh3++; if (age <= 4) fresh5++; }
    if (b[t].d === last) {
      const row = { s, c, m10, m20, gap: m10 / m20 - 1, age, val: val20 };
      if (isCross) exact.push(row);
      if (isSnap) snap.push(row);
    }
  }
}

const pct = (x) => (x * 100).toFixed(1) + "%";
const rp = (x) => "Rp " + (x / 1e9).toFixed(1) + " M";
console.log(`Data terakhir ${last}, saham dengan nilai transaksi 20 hari >= ${rp(MIN_VALUE)}`);
console.log(`\nSeberapa tepat rumus snapshot Stockbit (2 tahun, semua saham likuid):`);
console.log(`  baru cross hari itu ${pct(fresh1 / snapN)}, <= 3 hari ${pct(fresh3 / snapN)}, <= 5 hari ${pct(fresh5 / snapN)} (n=${snapN})`);
console.log(`  cross yang tertangkap rumus snapshot di harinya: ${pct(caught / crossN)} (n=${crossN})`);
const table = (rows) => rows.sort((a, b) => b.val - a.val).forEach((r) =>
  console.log(`  ${r.s.padEnd(5)} ${String(r.c).padStart(7)}  MA10 ${r.m10.toFixed(0).padStart(6)}  MA20 ${r.m20.toFixed(0).padStart(6)}  selisih ${pct(r.gap).padStart(5)}  umur ${String(r.age).padStart(2)} hr  ${rp(r.val)}`));
console.log(`\nCross tepat di ${last} (MA10 kemarin <= MA20, hari ini >):`);
table(exact);
console.log(`\nLolos rumus snapshot Stockbit di ${last}:`);
table(snap);
