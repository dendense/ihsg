// Pre-registered screener rules on IDX mining/energy stocks.
// Features use only what is known before the buy: yesterday's daily bar and history,
// plus today's opening price (visible as the pre-opening IEP in Stockbit at 08.45-08.59).
// Trade: buy at today's open + 1 tick, sell at session-1 close, day close, or a TP.
import { readFileSync } from "node:fs";
import { DATA } from "./config.mjs";
const { daily, intra } = JSON.parse(readFileSync(process.argv[2] ?? DATA));
const FEE_B = 0.0015, FEE_S = 0.0025;
const tick = (p) => (p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25);
const net = (buy, sell) => (sell * (1 - FEE_S)) / (buy * (1 + FEE_B)) - 1;
const SPLIT = "2026-04-01";

function rsi(cl, i, n = 14) {
  if (i < n) return null;
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const d = cl[k] - cl[k - 1]; if (d > 0) g += d; else l -= d; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

// session-1 end per weekday: Fri 11:30, else 12:00
const s1End = (d) => (new Date(d + "T00:00:00Z").getUTCDay() === 5 ? 11 * 60 + 30 : 12 * 60);

const rows = [];
for (const [s, bars] of Object.entries(daily)) {
  if (!Array.isArray(bars)) continue;
  const cl = bars.map((b) => b.c);
  const byDay = new Map();
  if (Array.isArray(intra[s])) for (const b of intra[s]) { if (!byDay.has(b.d)) byDay.set(b.d, []); byDay.get(b.d).push(b); }
  for (let t = 51; t < bars.length; t++) {
    const y = bars[t - 1], td = bars[t];
    const prev20 = bars.slice(t - 21, t - 1);
    const avgV = mean(prev20.map((b) => b.v));
    const avgVal = mean(bars.slice(t - 20, t).map((b) => b.v * b.c));
    if (avgVal < 10e9 || !y.v) continue; // liquid only: >= Rp 10 M per day
    const ma = (n) => mean(cl.slice(t - n, t));
    const f = {
      chg1: y.c / bars[t - 2].c - 1,
      pos: y.h > y.l ? (y.c - y.l) / (y.h - y.l) : 0.5,
      volR: avgV ? y.v / avgV : 0,
      rsi: rsi(cl, t - 1),
      ma5: ma(5), ma20: ma(20), ma50: ma(50), c: y.c,
      hi20: Math.max(...prev20.map((b) => b.h)),
      gap: td.o / y.c - 1,
    };
    const buy = td.o + tick(td.o);
    const o = { day: net(buy, td.c), hiNet: net(buy, td.h) };
    const ib = byDay.get(td.d);
    let fi = null;
    if (ib && ib.length > 20) {
      // the first 5m bar is the real opening auction price; Yahoo's daily open often is not
      const buy = ib[0].o + tick(ib[0].o);
      fi = { ...f, gap: ib[0].o / y.c - 1 };
      o.dayI = net(buy, td.c);
      const end = s1End(td.d);
      const s1 = ib.filter((b) => b.m < end).at(-1);
      if (s1) o.s1 = net(buy, s1.c);
      // TP: first 5m bar whose high reaches the TP after the opening bar, else the day close
      for (const tp of [0.01, 0.02]) {
        const target = Math.ceil((buy * (1 + tp)) / tick(buy)) * tick(buy);
        const hit = ib.find((b) => b.m > 9 * 60 && b.m <= 15 * 60 + 49 && b.h >= target);
        o["tp" + tp * 100] = hit ? net(buy, target) : net(buy, td.c);
      }
    }
    rows.push({ s, d: td.d, f, fi, o });
  }
}

const RULES = {
  R0_semua: () => true,
  R1_momentum_kuat: (f) => f.chg1 >= 0.03 && f.pos >= 0.8 && f.volR >= 1.5,
  R2_rebound_oversold: (f) => f.chg1 <= -0.04 && f.rsi != null && f.rsi <= 35,
  R3_tren_naik_tenang: (f) => f.c > f.ma20 && f.ma20 > f.ma50 && f.chg1 >= 0 && f.chg1 <= 0.02,
  R4_gap_down: (f) => f.gap <= -0.02,
  R5_gap_up_kecil_tren: (f) => f.gap >= 0.005 && f.gap <= 0.02 && f.c > f.ma20,
  R6_akumulasi_volume: (f) => f.volR >= 2 && f.pos >= 0.6 && f.chg1 >= 0 && f.chg1 <= 0.05,
  R7_breakout_20h: (f) => f.c >= f.hi20 && f.volR >= 1.2,
};

function stats(xs) {
  if (!xs.length) return null;
  const m = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  return { n: xs.length, mean: m, win: xs.filter((x) => x > 0).length / xs.length, t: sd ? (m / sd) * Math.sqrt(xs.length) : 0 };
}
const pct = (x) => (x * 100).toFixed(2);
const fmt = (st) => (st ? `n=${st.n} rata=${pct(st.mean)}% menang=${(st.win * 100).toFixed(0)}% t=${st.t.toFixed(1)}` : "-");
const res = {};
for (const [name, rule] of Object.entries(RULES)) {
  const sel = rows.filter((r) => rule(r.f));
  const tr = sel.filter((r) => r.d < SPLIT), te = sel.filter((r) => r.d >= SPLIT);
  const it = rows.filter((r) => r.fi && rule(r.fi) && r.o.s1 != null);
  res[name] = {
    day_train: stats(tr.map((r) => r.o.day)), day_test: stats(te.map((r) => r.o.day)),
    touch05_train: tr.length ? tr.filter((r) => r.o.hiNet >= 0.005).length / tr.length : null,
    touch05_test: te.length ? te.filter((r) => r.o.hiNet >= 0.005).length / te.length : null,
    s1_60d: stats(it.map((r) => r.o.s1)), day_60d: stats(it.map((r) => r.o.dayI)), days_60d: new Set(it.map((r) => r.d)).size,
    tp1_60d: stats(it.map((r) => r.o.tp1)), tp2_60d: stats(it.map((r) => r.o.tp2)),
  };
  console.log(`\n${name}`);
  console.log(`  tutup sesi 2 (latih <${SPLIT}): ${fmt(res[name].day_train)} | sempat +0,5% bersih: ${(res[name].touch05_train * 100).toFixed(0)}%`);
  console.log(`  tutup sesi 2 (uji  >=${SPLIT}): ${fmt(res[name].day_test)} | sempat +0,5% bersih: ${(res[name].touch05_test * 100).toFixed(0)}%`);
  console.log(`  60 hari 5m (${res[name].days_60d} hari berbeda): sesi1 ${fmt(res[name].s1_60d)}`);
  console.log(`              tutup ${fmt(res[name].day_60d)}`);
  console.log(`              TP1%  ${fmt(res[name].tp1_60d)}`);
  console.log(`              TP2%  ${fmt(res[name].tp2_60d)}`);
}
const dates = rows.map((r) => r.d).sort();
console.log("\nrentang", dates[0], "-", dates.at(-1), "baris", rows.length);

// Day-clustered view: average the trades of each day first, then test across days.
console.log("\nPer hari (rata-rata transaksi di hari yang sama dihitung satu):");
for (const name of ["R0_semua", "R2_rebound_oversold", "R4_gap_down"]) {
  const rule = RULES[name];
  const it = rows.filter((r) => r.fi && rule(r.fi) && r.o.s1 != null);
  for (const key of ["s1", "dayI", "tp1"]) {
    const byD = new Map();
    for (const r of it) { if (!byD.has(r.d)) byD.set(r.d, []); byD.get(r.d).push(r.o[key]); }
    const dm = [...byD.values()].map(mean);
    const st = stats(dm);
    console.log(`  ${name} ${key}: ${fmt(st)}  (hari positif ${(dm.filter((x) => x > 0).length)}/${dm.length})`);
  }
  // the daily-bar history (2y), shifted by Yahoo's open bias: buy 0.32% higher than the daily open
  const sel = rows.filter((r) => rule(r.f));
  for (const [lbl, part] of [["latih", sel.filter((r) => r.d < SPLIT)], ["uji", sel.filter((r) => r.d >= SPLIT)]]) {
    const adj = part.map((r) => (1 + r.o.day) / 1.0032 - 1);
    const byD = new Map(); part.forEach((r, i) => { if (!byD.has(r.d)) byD.set(r.d, []); byD.get(r.d).push(adj[i]); });
    console.log(`  ${name} 2th ${lbl}, open dikoreksi +0,32%, per hari: ${fmt(stats([...byD.values()].map(mean)))}`);
  }
}
