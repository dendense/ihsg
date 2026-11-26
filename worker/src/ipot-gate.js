// IPOT (indopremier.com) retired the public pages the broker summary, foreign
// flow, broker ranking, market statistics and corporate actions were read from
// (module/saham/include/*.php answer 502 since late November 2026; its new app
// reads them over a login-bound WebSocket). With IPOT_ENABLED = "false" the
// endpoints built on those pages answer at once with "source_unavailable"
// instead of spending subrequests on 502s, and the cron skips the bandar scan.
// Set IPOT_ENABLED = "true" to read IPOT again if it comes back.

export const IPOT_PATHS = new Set([
  "/bandar",
  "/bandar/screen",
  "/bandar/status",
  "/bandar/broker",
  "/broker",
  "/foreign",
  "/market/brokers",
  "/market/foreign",
  "/actions",
]);

/** IPOT is read unless the deployment says otherwise (tests and the CLI's twin keep it on). */
export const ipotEnabled = (env) => String(env?.IPOT_ENABLED ?? "true").toLowerCase() !== "false";

export const IPOT_UNAVAILABLE = {
  code: "source_unavailable",
  message: "IPOT no longer publishes broker summaries and foreign flow on its public pages; this data has no source here for now",
};
