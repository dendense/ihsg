// Day-trade screener study per stock group: buy at today's open, sell the same day.
// Features use only what is known before the buy: yesterday's daily bar and history,
// plus today's opening price (visible as the pre-opening IEP in Stockbit at 08.45-08.59).
// Trade: buy at the open + 1 tick, sell at the session-1 close, the day close, or a TP.
//
// Two data sources, two corrections:
//  - 60 days of 5-minute bars: the first bar's open is the real opening price; exits are exact.
//  - 2 years of daily bars: Yahoo's daily open is often not the opening price (44% of days,
//    median 0.32% below it), so the buy is taken 0.32% above the daily open.
// Every number is per signal DAY (a day's trades are averaged into one observation).
// Usage: node research/intraday-screener.mjs [group ...]
import { readFileSync } from "node:fs";
import { DATA, GROUPS } from "./config.mjs";

const { daily: ALL_DAILY, intra: ALL_INTRA } = JSON.parse(readFileSync(process.env.IHSG_DATA ?? DATA));
const FEE_B = 0.0015, FEE_S = 0.0025, SPLIT = "2026-04-01", OPEN_BIAS = 0.0032;
const tick = (p) => (p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25);
const net = (buy, sell) => (sell * (1 - FEE_S)) / (buy * (1 + FEE_B)) - 1;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const s1End = (d) => (new Date(d + "T00:00:00Z").getUTCDay() === 5 ? 11 * 60 + 30 : 12 * 60);
function rsi(cl, i, n = 14) {
  if (i < n) return null;
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const d = cl[k] - cl[k - 1]; d > 0 ? (g += d) : (l -= d); }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export const RULES = {
  R0_semua: () => true,
  R1_momentum_kuat: (f) => f.chg1 >= 0.03 && f.pos >= 0.8 && f.volR >= 1.5,
  R2_rebound_oversold: (f) => f.chg1 <= -0.04 && f.rsi != null && f.rsi <= 35,
  R3_tren_naik_tenang: (f) => f.c > f.ma20 && f.ma20 > f.ma50 && f.chg1 >= 0 && f.chg1 <= 0.02,
  R4_gap_down: (f) => f.gap <= -0.02,
  R5_gap_up_kecil_tren: (f) => f.gap >= 0.005 && f.gap <= 0.02 && f.c > f.ma20,
  R6_akumulasi_volume: (f) => f.volR >= 2 && f.pos >= 0.6 && f.chg1 >= 0 && f.chg1 <= 0.05,
  R7_breakout_20h: (f) => f.c >= f.hi20 && f.volR >= 1.2,
  // "trending": trading value of the last 20 days at least twice its 120-day average, known yesterday
  R8_trending: (f) => f.valR >= 2,
  R9_trending_naik: (f) => f.valR >= 2 && f.chg1 > 0 && f.c > f.ma20,
};

const st = (xs) => {
  if (!xs.length) return null;
  const m = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  return { n: xs.length, m, win: xs.filter((x) => x > 0).length / xs.length, t: sd ? (m / sd) * Math.sqrt(xs.length) : 0 };
};
const P = (x) => ((x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%").padStart(7);
const show = (s) => (s ? `${P(s.m)} hari+ ${String(Math.round(s.win * 100)).padStart(2)}% n=${String(s.n).padStart(3)} t=${s.t.toFixed(1).padStart(4)}` : "        -");

function study(name, syms) {
  const rows = [];
  for (const s of syms) {
    const bars = ALL_DAILY[s];
    if (!Array.isArray(bars)) continue;
    const cl = bars.map((b) => b.c);
    const byDay = new Map();
    if (Array.isArray(ALL_INTRA[s])) for (const b of ALL_INTRA[s]) { if (!byDay.has(b.d)) byDay.set(b.d, []); byDay.get(b.d).push(b); }
    for (let t = 121; t < bars.length; t++) {
      const y = bars[t - 1], td = bars[t];
      const val20 = mean(bars.slice(t - 20, t).map((b) => b.v * b.c));
      if (val20 < 10e9 || !y.v) continue; // liquid only, point in time
      const val120 = mean(bars.slice(t - 120, t).map((b) => b.v * b.c));
      const avgV = mean(bars.slice(t - 21, t - 1).map((b) => b.v));
      const ma = (n) => mean(cl.slice(t - n, t));
      const f = {
        chg1: y.c / bars[t - 2].c - 1, pos: y.h > y.l ? (y.c - y.l) / (y.h - y.l) : 0.5, volR: avgV ? y.v / avgV : 0,
        rsi: rsi(cl, t - 1), ma20: ma(20), ma50: ma(50), c: y.c,
        hi20: Math.max(...bars.slice(t - 21, t - 1).map((b) => b.h)), valR: val120 ? val20 / val120 : 0,
        gap: (td.o * (1 + OPEN_BIAS)) / y.c - 1,
      };
      const buyD = td.o * (1 + OPEN_BIAS) + tick(td.o);
      const row = { s, d: td.d, f, day2y: net(buyD, td.c) };
      const ib = byDay.get(td.d);
      if (ib && ib.length > 20) {
        const buy = ib[0].o + tick(ib[0].o);
        row.fi = { ...f, gap: ib[0].o / y.c - 1 };
        const s1 = ib.filter((b) => b.m < s1End(td.d)).at(-1);
        row.s1 = s1 ? net(buy, s1.c) : null;
        row.day = net(buy, td.c);
        const target = Math.ceil((buy * 1.01) / tick(buy)) * tick(buy);
        const hit = ib.find((b) => b.m > 9 * 60 && b.m <= 15 * 60 + 49 && b.h >= target);
        row.tp1 = hit ? net(buy, target) : net(buy, td.c);
      }
      rows.push(row);
    }
  }
  const perDay = (rs, key) => { const m = new Map(); for (const r of rs) if (r[key] != null) { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r[key]); } return [...m].map(([d, a]) => [d, mean(a)]); };
  const ds = rows.map((r) => r.d).sort();
  console.log(`\n=== ${name}: ${new Set(rows.map((r) => r.s)).size} saham lolos likuiditas, ${ds[0]} s/d ${ds.at(-1)} ===`);
  console.log("rata-rata per hari sinyal setelah fee | 2 thn: tutup sesi 2, latih / uji (open dikoreksi) | 60 hr bar 5m: tutup sesi 1 / tutup sesi 2 / TP 1%");
  for (const [rn, rule] of Object.entries(RULES)) {
    const sel = rows.filter((r) => rule(r.f));
    const d2 = perDay(sel, "day2y");
    const tr = st(d2.filter(([d]) => d < SPLIT).map(([, v]) => v)), te = st(d2.filter(([d]) => d >= SPLIT).map(([, v]) => v));
    const sel60 = rows.filter((r) => r.fi && rule(r.fi));
    const [a, b, c] = ["s1", "day", "tp1"].map((k) => st(perDay(sel60, k).map(([, v]) => v)));
    console.log(`  ${rn.padEnd(21)} ${show(tr)} / ${show(te)} || ${show(a)} / ${show(b)} / ${show(c)}`);
  }
}

const want = process.argv.slice(2);
for (const [name, syms] of Object.entries(GROUPS)) if (!want.length || want.includes(name)) study(name, syms);
console.log("\nCatatan: 'hari+' = persentase hari sinyal yang rata-ratanya positif; |t| >= 2 searah di semua kolom baru layak diperhatikan.");
