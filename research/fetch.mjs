// Pull 2y daily (via local ihsg-api) and 60d 5m bars (Yahoo chart) for the mining/energy list.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { API, DATA, MINING_ENERGY } from "./config.mjs";
const out = process.argv[2] ?? DATA;
mkdirSync(dirname(out), { recursive: true });
const SYMS = MINING_ENERGY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daily = {}, intra = {};
for (const s of SYMS) {
  try {
    const j = await (await fetch(`${API}/history?symbol=${s}&period=2y&interval=1d`)).json();
    daily[s] = j.data.candles.filter((c) => c.open && c.close).map((c) => ({ d: c.time.slice(0, 10), o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume ?? 0 }));
  } catch (e) { daily[s] = { err: String(e) }; }
  try {
    const j = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}.JK?range=60d&interval=5m`, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
    const r = j.chart.result[0], q = r.indicators.quote[0];
    intra[s] = r.timestamp.map((t, i) => {
      const w = new Date((t + 7 * 3600) * 1000).toISOString();
      return { d: w.slice(0, 10), m: +w.slice(11, 13) * 60 + +w.slice(14, 16), o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] };
    }).filter((b) => b.o != null && b.c != null);
  } catch (e) { intra[s] = { err: String(e) }; }
  await sleep(400);
}
writeFileSync(out, JSON.stringify({ daily, intra }));
console.log(SYMS.map((s) => `${s}:${daily[s].length ?? "E"}/${intra[s].length ?? "E"}`).join(" "));
