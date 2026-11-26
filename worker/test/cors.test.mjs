// node --test test/*.mjs (no network). The dashboard on GitHub Pages reads
// /api/* cross-origin: allowed origins get CORS headers, others do not.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { corsHeaders } from "../src/worker.js";

const env = { ALLOWED_ORIGINS: "https://dendense.github.io, http://localhost:5173", PUBLIC_HOST: "" };
const req = (path, origin, method = "GET") =>
  new Request(`https://ihsg-api.example.workers.dev${path}`, { method, headers: origin ? { origin } : {} });

test("allowed origin is echoed back", () => {
  const h = corsHeaders(env, req("/api/holidays", "https://dendense.github.io"));
  assert.equal(h["access-control-allow-origin"], "https://dendense.github.io");
  assert.equal(h.vary, "origin");
});

test("other origins get no allow-origin", () => {
  const h = corsHeaders(env, req("/api/holidays", "https://evil.example"));
  assert.equal(h["access-control-allow-origin"], undefined);
});

test("preflight answers 204 with CORS", async () => {
  const r = await worker.fetch(req("/api/quote", "http://localhost:5173", "OPTIONS"), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

test("an API answer carries CORS (holidays needs no network)", async () => {
  const r = await worker.fetch(req("/api/holidays?year=2026", "https://dendense.github.io"), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://dendense.github.io");
  const body = await r.json();
  assert.ok(body.data);
});

test("non-API paths are 404, host lock applies when set", async () => {
  assert.equal((await worker.fetch(req("/", null), env)).status, 404);
  const locked = { ...env, PUBLIC_HOST: "api.example.com" };
  assert.equal((await worker.fetch(req("/api/holidays", null), locked)).status, 404);
});

test("IPOT endpoints answer source_unavailable when IPOT is disabled, without fetching", async () => {
  const off = { ...env, IPOT_ENABLED: "false" };
  const orig = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error("no network in tests"); };
  try {
    for (const p of ["/api/bandar?symbol=BBCA", "/api/foreign?symbol=BBCA", "/api/market/brokers"]) {
      const r = await worker.fetch(req(p, "https://dendense.github.io"), off);
      assert.equal(r.status, 503);
      assert.equal(r.headers.get("access-control-allow-origin"), "https://dendense.github.io");
      assert.equal((await r.json()).error.code, "source_unavailable");
    }
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

test("other endpoints are untouched by the IPOT switch", async () => {
  const r = await worker.fetch(req("/api/holidays?year=2026", null), { ...env, IPOT_ENABLED: "false" });
  assert.equal(r.status, 200);
});
