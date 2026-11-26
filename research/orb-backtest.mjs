// Opening-range breakout (ORB) backtest on IDX 5-minute bars from the local ihsg-api.
// Educational: describes how a fixed rule would have done in the past; not a signal.
import { writeFileSync } from "node:fs";
import { API as B } from "./config.mjs";
const SYMS = "BUMI ANTM BRMS AMMN TINS DEWA AADI CUAN MDKA PTBA ENRG ADRO RAJA BREN DSSA PGAS MEDC MBMA INCO".split(" ");
const FEE_BUY = 0.0015, FEE_SELL = 0.0025; // typical IDX retail fees incl. 0.1% sell tax
const tick = (p) => (p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25);
const up = (p) => Math.ceil(p / tick(p)) * tick(p);
const down = (p) => Math.floor(p / tick(p)) * tick(p);
const mins = (t) => +t.slice(11, 13) * 60 + +t.slice(14, 16);

async function bars(s) {
  const r = await fetch(`${B}/history?symbol=${s}&period=1mo&interval=5m`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const days = new Map();
  for (const c of j.data.candles) {
    if (c.open == null || c.high == null) continue;
    const d = c.time.slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push({ m: mins(c.time), o: c.open, h: c.high, l: c.low, c: c.close });
  }
  return days;
}

/** one trade per day: stop-buy 1 tick above the 09:00-09:15 high, entries until `lastEntry`, target/stop in %, else exit at the day's close */
function runDay(day, { target, stop, lastEntry = 11 * 60 + 30, orBars = 3 }) {
  const or = day.filter((b) => b.m < 9 * 60 + orBars * 5);
  if (or.length < orBars) return null;
  const orHigh = Math.max(...or.map((b) => b.h))
  const trig = orHigh + tick(orHigh)
  const rest = day.filter((b) => b.m >= 9 * 60 + orBars * 5 && b.m <= 16 * 60);
  const closeBar = rest.at(-1);
  if (!closeBar) return null;
  let entry = null, i0 = -1;
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i];
    if (b.m > lastEntry) break;
    if (b.h >= trig) { entry = Math.max(trig, b.o); i0 = i; break; }
  }
  if (entry == null) return null;
  const tgt = up(entry * (1 + target)), stp = down(entry * (1 - stop));
  let exit = null, why = "close";
  for (let i = i0; i < rest.length; i++) {
    const b = rest[i];
    // the entry bar's low may come before the breakout; on that bar only its close can stop us out
    const hitStop = i === i0 ? b.c <= stp : b.l <= stp, hitTgt = b.h >= tgt;
    if (hitStop) { exit = Math.min(stp, b.o) - (b.o < stp ? 0 : tick(stp)); why = "stop"; break; }
    if (hitTgt && i > i0) { exit = Math.max(tgt, b.o); why = "target"; break; }
  }
  if (exit == null) exit = closeBar.c;
  const net = (exit * (1 - FEE_SELL)) / (entry * (1 + FEE_BUY)) - 1;
  return { entry, exit, why, net, gross: exit / entry - 1 };
}

const RULES = [
  { name: "TP 1% / SL 0,5%", target: 0.01, stop: 0.005 },
  { name: "TP 2% / SL 1%", target: 0.02, stop: 0.01 },
  { name: "TP 3% / SL 1,5%", target: 0.03, stop: 0.015 },
  { name: "Tanpa TP/SL, jual saat tutup", target: 9, stop: 0.99 },
];

const data = {};
for (let i = 0; i < SYMS.length; i += 4) await Promise.all(SYMS.slice(i, i + 4).map(async (s) => { try { data[s] = await bars(s); } catch (e) { data[s] = e.message; } }));

const result = { rules: [], perStock: {}, sessions: 0, errors: {} };
for (const r of RULES) {
  const trades = [];
  for (const s of SYMS) {
    if (typeof data[s] === "string") { result.errors[s] = data[s]; continue; }
    for (const [d, day] of data[s]) { const t = runDay(day, r); if (t) trades.push({ s, d, ...t }); }
  }
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((x) => x > 0);
  const losses = nets.filter((x) => x <= 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  // equity of one equal-sized position per trade, in date order
  trades.sort((a, b) => a.d.localeCompare(b.d));
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.net; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
  result.rules.push({
    rule: r.name, trades: trades.length, avgGross: sum(trades.map((t) => t.gross)) / trades.length, sample: trades.filter((t) => t.s === "ANTM").slice(0, 3), winRate: wins.length / trades.length, avgNet: sum(nets) / trades.length,
    avgWin: wins.length ? sum(wins) / wins.length : 0, avgLoss: losses.length ? sum(losses) / losses.length : 0,
    profitFactor: losses.length ? sum(wins) / -sum(losses) : null, maxDD: dd,
    exits: { target: trades.filter((t) => t.why === "target").length, stop: trades.filter((t) => t.why === "stop").length, close: trades.filter((t) => t.why === "close").length },
  });
  if (r.name.startsWith("TP 2%")) for (const s of SYMS) {
    const ts = trades.filter((t) => t.s === s);
    if (ts.length) result.perStock[s] = { trades: ts.length, winRate: ts.filter((t) => t.net > 0).length / ts.length, avgNet: sum(ts.map((t) => t.net)) / ts.length };
  }
}
result.sessions = Math.max(...Object.values(data).filter((v) => typeof v !== "string").map((m) => m.size));
result.from = [...Object.values(data).find((v) => typeof v !== "string").keys()].sort()[0];
result.to = [...Object.values(data).find((v) => typeof v !== "string").keys()].sort().at(-1);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.rules.map((r) => ({ ...r, winRate: +(r.winRate * 100).toFixed(1), avgNet: +(r.avgNet * 100).toFixed(3), avgGross: +(r.avgGross * 100).toFixed(3), avgWin: +(r.avgWin * 100).toFixed(2), avgLoss: +(r.avgLoss * 100).toFixed(2), profitFactor: r.profitFactor && +r.profitFactor.toFixed(2), maxDD: +(r.maxDD * 100).toFixed(1) })), null, 0));
console.log(result.from, result.to, result.sessions, JSON.stringify(result.errors));
