// Swing study (hold days, not minutes) per stock group, daily closes only.
// Mechanics fixed before looking at results:
//  - signal from day t's close; BUY at day t+1's close (closing auction, no look-ahead,
//    no spread; Yahoo daily closes match the 5-minute bars)
//  - SELL at the close N trading days later (N = 3, 5, 10), or at the first close that
//    breaches a -7% stop (close-based)
//  - fees 0.15% buy + 0.25% sell; liquid names only (>= Rp 10 M/day over 20 days, point in time)
//  - train: signals before 2026-04-01; test: from 2026-04-01
//  - every number is per signal DAY: the trades of one day are averaged into one observation
// Usage: node research/swing.mjs [group ...]   (groups: see config.mjs GROUPS; default all)
import { readFileSync } from "node:fs";
import { DATA, GROUPS } from "./config.mjs";

import { fileURLToPath } from "node:url";
const FEE_B = 0.0015, FEE_S = 0.0025, SPLIT = "2026-04-01", STOP = -0.07, HOLDS = [3, 5, 10];
const net = (b, s) => (s * (1 - FEE_S)) / (b * (1 + FEE_B)) - 1;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function rsi(cl, i, n) {
  if (i < n) return null;
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const d = cl[k] - cl[k - 1]; d > 0 ? (g += d) : (l -= d); }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export const RULES = {
  S0_semua: () => true,
  S1_pullback_tren: (f) => f.ma20 > f.ma50 && f.c > f.ma50 && f.c <= f.ma20 * 1.01 && f.rsi14 >= 35 && f.rsi14 <= 50,
  S2_oversold_dlm_tren: (f) => f.c > f.ma100 && f.rsi2 != null && f.rsi2 <= 10,
  S3_breakout_volume: (f) => f.c >= f.hi20 && f.volR >= 1.5,
  S4_oversold_dalam: (f) => f.rsi14 != null && f.rsi14 <= 25,
  S5_momentum_relatif: (f) => f.r20p >= 0.8 && f.c > f.ma20,
  S6_ma5_potong_ma20: (f) => f.ma5p <= f.ma20p && f.ma5 > f.ma20 && f.c > f.ma50,
  // "trending": trading value of the last 20 days at least twice its 120-day average, known that day
  S7_trending: (f) => f.valR >= 2,
  S8_trending_naik: (f) => f.valR >= 2 && f.c > f.ma20 && f.r20 > 0,
  // MA10 crossing above MA20: the exact event (yesterday at or below, today above), and the
  // snapshot a Stockbit screener can express without yesterday's values (see ma-cross.mjs)
  S9_ma10_potong_ma20: (f) => f.ma10p <= f.ma20p && f.ma10 > f.ma20,
  S10_ma10_ma20_stockbit: (f) => f.ma10 > f.ma20 && f.ma10 <= f.ma20 * 1.02 && f.c > f.ma10,
};

const st = (xs) => {
  if (!xs.length) return null;
  const m = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  return { n: xs.length, m, win: xs.filter((x) => x > 0).length / xs.length, t: sd ? (m / sd) * Math.sqrt(xs.length) : 0 };
};
const P = (x) => ((x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%").padStart(7);
const show = (s) => (s ? `${P(s.m)} hari+ ${String(Math.round(s.win * 100)).padStart(2)}% n=${String(s.n).padStart(3)} t=${s.t.toFixed(1).padStart(4)}` : "        -");

/**
 * Runs every rule on `daily` ({symbol: bars}). `eligible(symbol, date)` (optional) limits the
 * signals to a point-in-time universe; `every` > 1 keeps only every n-th signal date, so the
 * holds of consecutive signals do not overlap.
 */
export function study(name, daily, { eligible = () => true, every = 1 } = {}) {
  // cross-sectional inputs within the group: 20-day return percentile and breadth above MA50
  const ret20 = new Map(), above = new Map();
  for (const b of Object.values(daily)) {
    const cl = b.map((x) => x.c);
    b.forEach((x, i) => {
      if (i >= 20) { if (!ret20.has(x.d)) ret20.set(x.d, []); ret20.get(x.d).push(x.c / b[i - 20].c - 1); }
      if (i >= 50) { if (!above.has(x.d)) above.set(x.d, []); above.get(x.d).push(x.c > mean(cl.slice(i - 49, i + 1)) ? 1 : 0); }
    });
  }
  const pctile = (d, v) => { const a = ret20.get(d) || []; return a.length ? a.filter((x) => x <= v).length / a.length : 0.5; };
  const breadth = (d) => mean(above.get(d) || [0.5]);

  const rows = [];
  for (const [s, b] of Object.entries(daily)) {
    const cl = b.map((x) => x.c);
    const ma = (i, n) => mean(cl.slice(i - n + 1, i + 1));
    for (let t = 120; t < b.length - 1 - Math.max(...HOLDS); t++) {
      const x = b[t];
      const val20 = mean(b.slice(t - 19, t + 1).map((y) => y.v * y.c));
      if (val20 < 10e9 || !eligible(s, x.d)) continue;
      const val120 = mean(b.slice(t - 119, t + 1).map((y) => y.v * y.c));
      const v20 = mean(b.slice(t - 20, t).map((y) => y.v));
      const r20 = x.c / b[t - 20].c - 1;
      const f = {
        c: x.c, ma5: ma(t, 5), ma10: ma(t, 10), ma20: ma(t, 20), ma50: ma(t, 50), ma100: ma(t, 100),
        ma5p: ma(t - 1, 5), ma10p: ma(t - 1, 10), ma20p: ma(t - 1, 20), rsi14: rsi(cl, t, 14), rsi2: rsi(cl, t, 2),
        hi20: Math.max(...b.slice(t - 20, t).map((y) => y.h)), volR: v20 ? x.v / v20 : 0,
        r20, r20p: pctile(x.d, r20), valR: val120 ? val20 / val120 : 0,
      };
      const buy = b[t + 1].c, o = {};
      for (const N of HOLDS) {
        let exit = b[t + 1 + N].c;
        for (let k = 1; k <= N; k++) if (b[t + 1 + k].c / buy - 1 <= STOP) { exit = b[t + 1 + k].c; break; }
        o[N] = net(buy, exit);
      }
      rows.push({ s, d: x.d, f, o });
    }
  }

  if (every > 1) {
    const keep = new Set([...new Set(rows.map((r) => r.d))].sort().filter((_, i) => i % every === 0));
    rows.splice(0, rows.length, ...rows.filter((r) => keep.has(r.d)));
  }
  const perDay = (rs, N) => { const m = new Map(); for (const r of rs) { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r.o[N]); } return m; };
  const baseDay = new Map([...perDay(rows, 5)].map(([d, a]) => [d, mean(a)]));
  const ds = rows.map((r) => r.d).sort();
  console.log(`\n=== ${name}: ${Object.keys(daily).length} saham, ${new Set(rows.map((r) => r.s)).size} lolos likuiditas, sinyal ${ds[0]} s/d ${ds.at(-1)} ===`);
  console.log("tahan 5 hari, rata-rata per hari sinyal setelah fee | latih <2026-04-01 | uji >=2026-04-01 | selisih vs S0 (latih / uji)");
  const summary = {};
  for (const [rn, rule] of Object.entries(RULES)) {
    const sel = rows.filter((r) => rule(r.f));
    const m = perDay(sel, 5);
    const part = (p) => [...m].filter(([d]) => p(d));
    const tr = st(part((d) => d < SPLIT).map(([, a]) => mean(a))), te = st(part((d) => d >= SPLIT).map(([, a]) => mean(a)));
    const xtr = st(part((d) => d < SPLIT).map(([d, a]) => mean(a) - baseDay.get(d))), xte = st(part((d) => d >= SPLIT).map(([d, a]) => mean(a) - baseDay.get(d)));
    summary[rn] = { tr, te, xtr, xte };
    console.log(`  ${rn.padEnd(21)} ${show(tr)} | ${show(te)} | ${rn === "S0_semua" ? "" : `${P(xtr?.m ?? 0)} (t=${(xtr?.t ?? 0).toFixed(1)}) / ${P(xte?.m ?? 0)} (t=${(xte?.t ?? 0).toFixed(1)})`}`);
  }
  // held 3 and 10 days, baseline only: how much the group's own direction drives everything
  for (const N of [3, 10]) {
    const m = perDay(rows, N);
    const tr = st([...m].filter(([d]) => d < SPLIT).map(([, a]) => mean(a))), te = st([...m].filter(([d]) => d >= SPLIT).map(([, a]) => mean(a)));
    console.log(`  S0_semua tahan ${String(N).padStart(2)}      ${show(tr)} | ${show(te)}`);
  }
  // post-hoc regime filter: only days with >= 50% of the group above its MA50
  const reg = rows.filter((r) => breadth(r.d) >= 0.5);
  const m = perDay(reg, 5);
  console.log(`  [post-hoc] S0 + breadth>=50% ${show(st([...m].filter(([d]) => d < SPLIT).map(([, a]) => mean(a))))} | ${show(st([...m].filter(([d]) => d >= SPLIT).map(([, a]) => mean(a))))}`);
  return summary;
}

export const NOTE = "\nCatatan: 'hari+' = persentase hari sinyal yang rata-ratanya positif; |t| >= 2 di latih DAN uji, searah, baru layak diperhatikan.";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { daily: ALL } = JSON.parse(readFileSync(process.env.IHSG_DATA ?? DATA));
  const want = process.argv.slice(2);
  for (const [name, syms] of Object.entries(GROUPS)) {
    if (want.length && !want.includes(name)) continue;
    study(name, Object.fromEntries(syms.filter((s) => Array.isArray(ALL[s])).map((s) => [s, ALL[s]])));
  }
  console.log(NOTE);
}
