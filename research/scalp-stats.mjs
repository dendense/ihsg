// Descriptive stats for scalping candidates from the local ihsg-api (daily candles + profile).
import { API as B, MINING_ENERGY } from "./config.mjs";
const syms = MINING_ENERGY;
const tick = (p) => (p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25);
const get = async (p) => { const r = await fetch(`${B}/${p}`); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.data; };
const out = [];
for (let i = 0; i < syms.length; i += 4) {
  await Promise.all(syms.slice(i, i + 4).map(async (s) => {
    try {
      const [h, p] = await Promise.all([get(`history?symbol=${s}&period=3mo&interval=1d`), get(`profile?symbol=${s}`).catch(() => ({}))]);
      const c = h.candles.filter((x) => x.open && x.close && x.volume != null);
      const last = c.slice(-20);
      const tr = c.slice(-15).map((x, k, a) => { const pc = (k ? a[k - 1] : c[c.length - 16]).close; return Math.max(x.high - x.low, Math.abs(x.high - pc), Math.abs(x.low - pc)); }).slice(1);
      const close = c.at(-1).close;
      const atrPct = (tr.reduce((a, b) => a + b, 0) / tr.length) / close * 100;
      const rangePct = last.map((x) => (x.high - x.low) / x.open * 100);
      const avgRange = rangePct.reduce((a, b) => a + b, 0) / rangePct.length;
      const days2 = rangePct.filter((r) => r >= 2).length;
      const valueB = last.reduce((a, x) => a + x.close * x.volume, 0) / last.length / 1e9;
      const ret20 = (close / last[0].close - 1) * 100;
      out.push({ s, industry: p.industry ?? "", close, tickPct: tick(close) / close * 100, atrPct, avgRange, days2, valueB, ret20 });
    } catch (e) { out.push({ s, err: e.message }); }
  }));
}
out.sort((a, b) => (b.valueB ?? -1) - (a.valueB ?? -1));
console.log(JSON.stringify(out));
