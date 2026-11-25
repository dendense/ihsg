// Indonesian number and time style: 5.050,43 · Rp 9,8 T · 14.32 WIB.

const DASH = "–"
const nf = (min: number, max: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: min, maximumFractionDigits: max })
const N0 = nf(0, 0)
const N2 = nf(2, 2)
const N1 = nf(1, 1)

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v)

/** A price in whole rupiah, or with two decimals for an index. */
export const price = (v: number | null | undefined, decimals = 0) => (ok(v) ? (decimals ? N2 : N0).format(v) : DASH)

/** +125 / −30, with a true minus sign. */
export const change = (v: number | null | undefined, decimals = 0) => {
  if (!ok(v)) return DASH
  const s = (decimals ? N2 : N0).format(Math.abs(v))
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s
}

/** +1,28% / −0,68% / 0,00% */
export const pct = (v: number | null | undefined, signed = true) => {
  if (!ok(v)) return DASH
  const s = N2.format(Math.abs(v))
  if (!signed) return `${v < 0 ? "−" : ""}${s}%`
  return v > 0 ? `+${s}%` : v < 0 ? `−${s}%` : `${s}%`
}

/** 1,2 rb · 48,2 jt · 9,8 M · 1,3 T (ribu, juta, miliar, triliun). */
export const compact = (v: number | null | undefined) => {
  if (!ok(v)) return DASH
  const a = Math.abs(v)
  const sign = v < 0 ? "−" : ""
  if (a >= 1e12) return `${sign}${N1.format(a / 1e12)} T`
  if (a >= 1e9) return `${sign}${N1.format(a / 1e9)} M`
  if (a >= 1e6) return `${sign}${N1.format(a / 1e6)} jt`
  if (a >= 1e3) return `${sign}${N1.format(a / 1e3)} rb`
  return `${sign}${N0.format(a)}`
}

export const rupiah = (v: number | null | undefined) => (ok(v) ? `Rp ${compact(v)}` : DASH)

/** Signed rupiah amount: +Rp 412 M / −Rp 1,2 T */
export const rupiahSigned = (v: number | null | undefined) => (ok(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}Rp ${compact(Math.abs(v))}` : DASH)

export const ratio = (v: number | null | undefined, suffix = "×") => (ok(v) ? `${N1.format(v)}${suffix}` : DASH)
export const pctPlain = (v: number | null | undefined) => (ok(v) ? `${N1.format(v)}%` : DASH)

const WIB = "Asia/Jakarta"
export const clock = (d: Date | number | string) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: WIB }).format(new Date(d))
export const dateShort = (d: Date | number | string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: WIB }).format(new Date(d))
export const dateLong = (d: Date | number | string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: WIB }).format(new Date(d))

/**
 * -1 / 0 / 1 for colour and arrow choice, judged at display precision: a
 * float residue such as 1e-12 that prints as "0,00" is flat, never a rise.
 */
export const dir = (v: number | null | undefined, decimals = 2) => {
  if (!ok(v)) return 0
  const r = Math.round(v * 10 ** decimals)
  return r === 0 ? 0 : r > 0 ? 1 : -1
}
