// Swing study (hold days, not minutes) on IDX mining/energy, daily closes only.
// Mechanics fixed before looking at results:
//  - signal from day t's close; BUY at day t+1's close (closing auction, no look-ahead,
//    no spread: the close is one auction price; Yahoo daily closes match the 5m bars)
//  - SELL at the close N trading days later (N = 3, 5, 10), or the first close that
//    breaches a stop of -7% (checked on closes only, like a close-based stop)
//  - fees 0.15% buy + 0.25% sell; liquid names only (>= Rp 10 M/day over 20 days)
//  - train: signals before 2026-04-01; test: from 2026-04-01
import { readFileSync } from "node:fs";
import { DATA } from "./config.mjs";
const { daily } = JSON.parse(readFileSync(process.argv[2] ?? DATA));
const FEE_B = 0.0015, FEE_S = 0.0025, SPLIT = "2026-04-01", STOP = -0.07;
const net = (b, s) => (s * (1 - FEE_S)) / (b * (1 + FEE_B)) - 1;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function rsi(cl, i, n) {
  if (i < n) return null;
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const d = cl[k] - cl[k - 1]; d > 0 ? (g += d) : (l -= d); }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

// 20-day return of every stock per date, for the cross-sectional momentum rule
const ret20 = new Map();
for (const [s, b] of Object.entries(daily)) if (Array.isArray(b)) b.forEach((x, i) => { if (i >= 20) { if (!ret20.has(x.d)) ret20.set(x.d, []); ret20.get(x.d).push(x.c / b[i - 20].c - 1); } });
const pctile = (d, v) => { const a = ret20.get(d) || []; return a.length ? a.filter((x) => x <= v).length / a.length : 0.5; };

const rows = [];
for (const [s, b] of Object.entries(daily)) {
  if (!Array.isArray(b)) continue;
  const cl = b.map((x) => x.c);
  const ma = (i, n) => mean(cl.slice(i - n + 1, i + 1));
  for (let t = 100; t < b.length - 11; t++) {
    const x = b[t];
    const val20 = mean(b.slice(t - 19, t + 1).map((y) => y.v * y.c));
    if (val20 < 10e9) continue;
    const v20 = mean(b.slice(t - 20, t).map((y) => y.v));
    const f = {
      c: x.c, ma5: ma(t, 5), ma20: ma(t, 20), ma50: ma(t, 50), ma100: ma(t, 100),
      ma5p: ma(t - 1, 5), ma20p: ma(t - 1, 20),
      rsi14: rsi(cl, t, 14), rsi2: rsi(cl, t, 2),
      hi20: Math.max(...b.slice(t - 20, t).map((y) => y.h)),
      volR: v20 ? x.v / v20 : 0,
      r20: x.c / b[t - 20].c - 1, r20p: pctile(x.d, x.c / b[t - 20].c - 1),
    };
    const buy = b[t + 1].c;
    const o = {};
    for (const N of [3, 5, 10]) {
      let exit = b[t + 1 + N].c;
      for (let k = 1; k <= N; k++) if (b[t + 1 + k].c / buy - 1 <= STOP) { exit = b[t + 1 + k].c; break; }
      o[N] = net(buy, exit);
    }
    rows.push({ s, d: x.d, f, o });
  }
}

const RULES = {
  S0_semua: () => true,
  S1_pullback_tren: (f) => f.ma20 > f.ma50 && f.c > f.ma50 && f.c <= f.ma20 * 1.01 && f.rsi14 >= 35 && f.rsi14 <= 50,
  S2_oversold_dlm_tren: (f) => f.c > f.ma100 && f.rsi2 != null && f.rsi2 <= 10,
  S3_breakout_volume: (f) => f.c >= f.hi20 && f.volR >= 1.5,
  S4_oversold_dalam: (f) => f.rsi14 != null && f.rsi14 <= 25,
  S5_momentum_relatif: (f) => f.r20p >= 0.8 && f.c > f.ma20,
  S6_ma5_potong_ma20: (f) => f.ma5p <= f.ma20p && f.ma5 > f.ma20 && f.c > f.ma50,
};

const st = (xs) => {
  if (!xs.length) return null;
  const m = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  return { n: xs.length, m, win: xs.filter((x) => x > 0).length / xs.length, t: sd ? (m / sd) * Math.sqrt(xs.length) : 0 };
};
// cluster by signal day (all trades of a day count as one observation)
const byDay = (rs, N) => { const m = new Map(); for (const r of rs) { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r.o[N]); } return [...m.values()].map(mean); };
const P = (x) => (x * 100).toFixed(2) + "%";
const show = (s) => (s ? `${P(s.m).padStart(7)} menang ${(s.win * 100).toFixed(0).padStart(2)}% n=${String(s.n).padStart(3)} t=${s.t.toFixed(1)}` : "-");

const out = {};
for (const [name, rule] of Object.entries(RULES)) {
  const sel = rows.filter((r) => rule(r.f));
  console.log(`\n${name}  (${sel.length} sinyal, ${new Set(sel.map((r) => r.d)).size} hari)`);
  out[name] = {};
  for (const N of [3, 5, 10]) {
    const tr = st(byDay(sel.filter((r) => r.d < SPLIT), N)), te = st(byDay(sel.filter((r) => r.d >= SPLIT), N));
    out[name][N] = { tr, te };
    console.log(`  tahan ${String(N).padStart(2)} hari | latih ${show(tr)} | uji ${show(te)}`);
  }
}
// excess over the same days' baseline (does the rule beat just holding the sector those days?)
console.log("\nSelisih terhadap pembanding S0 di hari yang sama (per hari, tahan 5 hari):");
const base = new Map(); { const m = new Map(); for (const r of rows) { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r.o[5]); } for (const [d, a] of m) base.set(d, mean(a)); }
for (const [name, rule] of Object.entries(RULES)) {
  if (name === "S0_semua") continue;
  const m = new Map(); for (const r of rows.filter((r) => rule(r.f))) { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r.o[5]); }
  const ex = (part) => st([...m].filter(([d]) => part(d)).map(([d, a]) => mean(a) - base.get(d)));
  console.log(`  ${name.padEnd(22)} latih ${show(ex((d) => d < SPLIT))} | uji ${show(ex((d) => d >= SPLIT))}`);
}
const ds = rows.map((r) => r.d).sort();
console.log("\nsinyal", ds[0], "-", ds.at(-1), "baris", rows.length);

// Post-hoc (asked after seeing the regime split): trade only when the sector is in an uptrend.
// Breadth = share of the 36 stocks whose close is above their own MA50 on the signal day.
const above = new Map();
for (const [s, b] of Object.entries(daily)) if (Array.isArray(b)) {
  const cl = b.map((x) => x.c);
  b.forEach((x, i) => { if (i >= 50) { if (!above.has(x.d)) above.set(x.d, []); above.get(x.d).push(x.c > mean(cl.slice(i - 49, i + 1)) ? 1 : 0); } });
}
const breadth = (d) => mean(above.get(d) || [0.5]);
console.log("\nFilter kondisi sektor (post-hoc): hanya hari ketika ≥ X% saham di atas MA50 masing-masing");
for (const X of [0.5, 0.6]) {
  for (const name of ["S0_semua", "S2_oversold_dlm_tren", "S3_breakout_volume", "S5_momentum_relatif"]) {
    const sel = rows.filter((r) => RULES[name](r.f) && breadth(r.d) >= X);
    const tr = st(byDay(sel.filter((r) => r.d < SPLIT), 5)), te = st(byDay(sel.filter((r) => r.d >= SPLIT), 5));
    console.log(`  X=${X * 100}% ${name.padEnd(22)} tahan 5 | latih ${show(tr)} | uji ${show(te)}`);
  }
}
const days = [...above.keys()].sort();
const share = (part) => { const ds = days.filter(part); return `${ds.filter((d) => breadth(d) >= 0.5).length}/${ds.length}`; };
console.log(`  hari dengan breadth ≥50%: latih ${share((d) => d < SPLIT)}, uji ${share((d) => d >= SPLIT)}`);
