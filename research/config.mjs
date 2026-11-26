// Shared settings for the research scripts.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The ihsg-api to read history from: the local `wrangler dev` (default) or the deployed Worker. */
export const API = (process.env.IHSG_API ?? "http://localhost:8790/api").replace(/\/$/, "");
/** Where fetch.mjs writes and the studies read the price data (gitignored). */
export const DATA = process.env.IHSG_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "data", "data.json");

/** The 36 mining and energy names studied (all in the ihsg universe). */
export const MINING_ENERGY =
  "AADI ADMR ADRO PTBA ITMG BYAN INDY HRUM BUMI DEWA GEMS DSSA TOBA ABMM ANTM INCO MDKA MBMA NCKL TINS BRMS AMMN PSAB ARCI MEDC PGAS ELSA AKRA ENRG RAJA ESSA PGEO BREN CUAN RATU DOID".split(" ");
