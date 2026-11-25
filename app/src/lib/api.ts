// Client for the ihsg-api Worker (fzn0x/idx web API, adapted). Every answer is
// the CLI's JSON envelope: { schema, provider, fetched_at, cached, stale,
// warnings, data } or { error: { code, message }, exit_code }.

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:8790"

export type Envelope<T> = {
  schema: string
  provider?: string
  fetched_at?: number
  cached?: boolean
  stale?: boolean
  warnings?: string[]
  data: T
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function api<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
  let r: Response
  try {
    r = await fetch(`${API_BASE}/api/${path}`, { headers: { Accept: "application/json" }, signal })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
    throw new ApiError("network", "Server data tidak bisa dihubungi", 0)
  }
  let body: unknown = null
  try {
    body = await r.json()
  } catch {
    /* not JSON */
  }
  const err = (body as { error?: { code: string; message: string } } | null)?.error
  if (!r.ok || err) throw new ApiError(err?.code ?? "http", err?.message ?? `HTTP ${r.status}`, r.status)
  return body as Envelope<T>
}

/* ---- shapes (only the fields the dashboard reads) ---------------------- */

export type Mover = {
  symbol: string
  name: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  volume: number | null
  value: number | null
  market_cap: number | null
}

export type Market = {
  as_of: string | null
  refreshed_at: string
  market_open: boolean
  index: Mover | null
  index_tape: [number, number][]
  quoted: number
  advancing: number
  declining: number
  unchanged: number
  turnover: number
  market_state: string | null
  behind_session: boolean
  gainers: Mover[]
  losers: Mover[]
  most_active: Mover[]
  heavyweights: Mover[]
  universe: number
}

export type Quote = {
  symbol: string
  name: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  previous_close: number | null
  open: number | null
  day_high: number | null
  day_low: number | null
  volume: number | null
  avg_volume_3m: number | null
  market_cap: number | null
  pe_trailing: number | null
  price_to_book: number | null
  dividend_yield_pct: number | null
  week52_high: number | null
  week52_low: number | null
  market_state: string | null
  market_time: string | null
}

export type RawCandle = { time: string; open: number; high: number; low: number; close: number; volume: number | null }
export type History = {
  symbol: string
  name: string | null
  period: string
  interval: string
  candles: RawCandle[]
  summary: { change: number; change_pct: number; high: number; low: number } | null
}

export type Fundamentals = {
  symbol: string
  name: string | null
  sector: string | null
  industry: string | null
  price: number | null
  valuation: Record<string, number | null>
  profitability: Record<string, number | null>
  health: Record<string, number | null>
  growth: Record<string, number | null>
  dividend: { yield_pct: number | null; payout_ratio_pct: number | null; ex_dividend_date: string | null }
  analyst: { recommendation: string | null; target_mean: number | null; target_high: number | null; target_low: number | null; analysts: number | null } | null
  most_recent_quarter: string | null
  verdict: { label: string; score: number; reasons: string[] } | null
}

export type Broker = { rank: number; code: string; name: string | null; kind: string | null; lots: number | null; value: number | null; average_price: number | null }
export type Bandar = {
  symbol: string
  period: string
  from: string
  to: string
  signal: string
  phase: string
  net_value: number | null
  net_pct: number | null
  bandar_average: number | null
  bandar_gain_pct: number | null
  total_value: number | null
  foreign_net_value: number | null
  foreign_net_pct: number | null
  buyers: Broker[]
  sellers: Broker[]
}

export type ForeignDay = {
  date: string
  value: number | null
  foreign_buy_value: number | null
  foreign_sell_value: number | null
  foreign_net_value: number | null
  foreign_share_pct: number | null
}
export type Foreign = {
  symbol: string
  from: string
  to: string
  days: ForeignDay[]
  totals: { sessions: number; foreign_net_value: number | null; foreign_share_pct: number | null; net_buy_sessions: number; net_sell_sessions: number }
}

export type Instrument = { symbol: string; name: string }
export type Instruments = { total: number; instruments: Instrument[] }
