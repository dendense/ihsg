// ihsg API: Cloudflare Worker behind the Dens-UI dashboard on GitHub Pages.
//
// Adapted from fzn0x/idx web/src/worker.js (MIT, see LICENSE.idx). The
// original also served the landing page, terminal and docs from `public/`;
// here the Worker only answers the API, and the dashboard lives on GitHub
// Pages, so `/api/*` carries CORS headers for the origins in ALLOWED_ORIGINS.
//
// - `/api/*` answers with the same JSON envelopes as `idx -o json`, backed by
//   a D1 snapshot that `scheduled()` refreshes every minute in trading hours;
//   the same cron loads the KSEI register and runs the bandar scan after each
//   close (src/cron.js).
// - PUBLIC_HOST (optional, comma separated): when set, any other Host gets a
//   404, so a stray preview route exposes nothing.

import { route, ApiError, refreshSnapshot } from "./api.js";
import { ownershipSync } from "./ownership-sync.js";
import { bandarScanStep } from "./bandar-scan.js";
import { runCron } from "./cron.js";
import { SECURITY_HEADERS } from "./headers.js";
import { IPOT_PATHS, IPOT_UNAVAILABLE, ipotEnabled } from "./ipot-gate.js";

const list = (s) => String(s || "").split(",").map((v) => v.trim()).filter(Boolean);

// Constant-time comparison for the maintainer token.
function tokenOk(env, given) {
  const want = env.ADMIN_TOKEN || "";
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** CORS headers for an allowed Origin, none otherwise. "*" in ALLOWED_ORIGINS opens it to all. */
export function corsHeaders(env, request) {
  const origin = request.headers.get("origin");
  const allowed = list(env.ALLOWED_ORIGINS);
  if (!origin || !(allowed.includes("*") || allowed.includes(origin))) return { vary: "origin" };
  return {
    "access-control-allow-origin": allowed.includes("*") ? "*" : origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "accept",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    // noindex: API envelopes are data for the pages and the CLI, not search results.
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...SECURITY_HEADERS, ...extra },
  });
}

function errorResponse(e, cors) {
  if (e instanceof ApiError || e?.code === "usage") {
    const exit = e.exit ?? 2, status = e.status ?? (e.code === "usage" ? 400 : 500);
    return json({ error: { code: e.code, message: e.message }, exit_code: exit }, status, cors);
  }
  console.error("api error", e);
  return json({ error: { code: "provider", message: String(e?.message || e) }, exit_code: 3 }, 502, cors);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hosts = list(env.PUBLIC_HOST);
    if (hosts.length && !hosts.includes(url.hostname)) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/healthz") {
      return new Response("ok", { headers: { "content-type": "text/plain", ...SECURITY_HEADERS } });
    }
    if (!url.pathname.startsWith("/api/")) {
      return json({ error: { code: "not_found", message: "This Worker only serves /api/*" }, exit_code: 4 }, 404);
    }
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: { code: "usage", message: "GET only" }, exit_code: 2 }, 405, cors);
    // Maintainer-only: force a snapshot refresh (needs the shared token).
    if (url.pathname === "/api/refresh") {
      if (!tokenOk(env, url.searchParams.get("token"))) return json({ error: { code: "usage", message: "forbidden" }, exit_code: 2 }, 403, cors);
      try {
        if (url.searchParams.get("what") === "ownership") return json(await ownershipSync(env, { force: true }), 200, cors);
        if (url.searchParams.get("what") === "bandar") return json(await bandarScanStep(env, { force: true }), 200, cors);
        return json(await refreshSnapshot(env, { force: true }), 200, cors);
      } catch (e) { return errorResponse(e, cors); }
    }
    // A retired source answers at once, without a single subrequest.
    if (!ipotEnabled(env) && IPOT_PATHS.has(url.pathname.slice(4))) {
      return json({ error: IPOT_UNAVAILABLE, exit_code: 3 }, 503, { "cache-control": "public, max-age=300", ...cors });
    }
    try {
      const env_ = await route(env, url);
      const ttl = url.pathname === "/api/market" || url.pathname === "/api/quote" ? 20 : 60;
      return json(env_, 200, { "cache-control": `public, max-age=${ttl}`, ...cors });
    } catch (e) {
      return errorResponse(e, cors);
    }
  },

  // The minute cron (src/cron.js): the quote board and one step of the KSEI
  // register sync from the GitHub mirror, then one step of the bandar scan,
  // inside one subrequest budget. The runtime waits for the returned promise.
  scheduled(event, env) {
    return runCron(env, { now: new Date(event?.scheduledTime ?? Date.now()) });
  },
};
