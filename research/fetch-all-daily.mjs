// Daily bars (2 years) for the whole ihsg universe, for point-in-time universes:
// ranking "the most traded names" on each day with only what was known that day.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "./config.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const universe = (await import(join(here, "..", "worker", "src", "universe.json"), { with: { type: "json" } })).default.map((x) => x[0]);
const out = process.argv[2] ?? join(here, "data", "all-daily.json");
mkdirSync(dirname(out), { recursive: true });
const daily = {};
let failed = 0;
for (let i = 0; i < universe.length; i += 6) {
  await Promise.all(universe.slice(i, i + 6).map(async (s) => {
    try {
      const j = await (await fetch(`${API}/history?symbol=${s}&period=2y&interval=1d`)).json();
      if (j.error) throw new Error(j.error.message);
      daily[s] = j.data.candles.filter((c) => c.open && c.close).map((c) => ({ d: c.time.slice(0, 10), o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume ?? 0 }));
    } catch { failed++; }
  }));
}
writeFileSync(out, JSON.stringify({ daily }));
console.log(`${Object.keys(daily).length} saham tersimpan, ${failed} gagal -> ${out}`);
