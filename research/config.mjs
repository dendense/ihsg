// Shared settings for the research scripts.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The ihsg-api to read history from: the local `wrangler dev` (default) or the deployed Worker. */
export const API = (process.env.IHSG_API ?? "http://localhost:8790/api").replace(/\/$/, "");
export const LIVE_API = "https://ihsg-api.denyfarras.workers.dev/api";

/** Stops a fetch script before it starts when the API cannot be reached, so no data file is overwritten. */
export async function requireApi() {
  try {
    const r = await fetch(`${API}/history?symbol=BBCA&period=5d&interval=1d`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error(`API ${API} tidak bisa dihubungi (${e.cause?.code ?? e.message}). File data tidak diubah.`);
    console.error(`Jalankan Worker lokal (cd worker && npm run dev -- --port 8790), atau pakai Worker live:`);
    console.error(`  IHSG_API=${LIVE_API} node research/${process.argv[1].split("/").at(-1)}`);
    process.exit(1);
  }
}
/** Where fetch.mjs writes and the studies read the price data (gitignored). */
export const DATA = process.env.IHSG_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "data", "data.json");

import { readFileSync } from "node:fs";

/** The 36 mining and energy names studied (all in the ihsg universe). */
export const MINING_ENERGY =
  "AADI ADMR ADRO PTBA ITMG BYAN INDY HRUM BUMI DEWA GEMS DSSA TOBA ABMM ANTM INCO MDKA MBMA NCKL TINS BRMS AMMN PSAB ARCI MEDC PGAS ELSA AKRA ENRG RAJA ESSA PGEO BREN CUAN RATU DOID".split(" ");

/** Banks in the ihsg universe (by listed name); the studies' liquidity filter drops the thin ones. */
export const BANKS =
  "AGRO AGRS AMAR ARTO BABP BACA BANK BBCA BBHI BBKP BBMD BBNI BBRI BBSI BBTN BBYB BCIC BDMN BEKS BGTG BINA BJBR BJTM BKSW BMAS BMRI BNBA BNGA BNII BNLI BRIS BSIM BSWD BTPN BTPS BVIC DNAR INPC MASB MAYA MCOR MEGA NISP NOBU PNBN PNBS SDRA SUPA".split(" ");

/**
 * The 150 most traded names by 3-month average value, as ranked on 27 Nov 2026
 * (broad.json). Chosen with recent liquidity, so it leans toward names that are
 * busy now; the studies' own filters are point-in-time.
 */
export const BROAD = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "broad.json"), "utf8"));

export const GROUPS = { tambang_energi: MINING_ENERGY, perbankan: BANKS, likuid_150: BROAD };
export const ALL = [...new Set([...MINING_ENERGY, ...BANKS, ...BROAD])];
