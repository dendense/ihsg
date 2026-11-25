// The IDX trading day in WIB (schedule from fzn0x/idx web/public/clock.js):
//   pre-opening   08:45-08:59
//   session I     09:00-12:00 Mon-Thu, 09:00-11:30 Fri
//   break
//   session II    13:30-15:49 Mon-Thu, 14:00-15:49 Fri
//   pre-closing   15:50-16:01
//   post-closing  16:02-16:15

export type Phase = { key: string; label: string; start: number; end: number; trading: boolean }

const m = (h: number, min: number) => h * 60 + min

export function schedule(dow: number): Phase[] {
  const fri = dow === 5
  return [
    { key: "pre", label: "Pra-pembukaan", start: m(8, 45), end: m(9, 0), trading: false },
    { key: "s1", label: "Sesi 1", start: m(9, 0), end: fri ? m(11, 30) : m(12, 0), trading: true },
    { key: "break", label: "Istirahat", start: fri ? m(11, 30) : m(12, 0), end: fri ? m(14, 0) : m(13, 30), trading: false },
    { key: "s2", label: "Sesi 2", start: fri ? m(14, 0) : m(13, 30), end: m(15, 50), trading: true },
    { key: "close", label: "Pra-penutupan", start: m(15, 50), end: m(16, 2), trading: false },
    { key: "post", label: "Pasca-penutupan", start: m(16, 2), end: m(16, 15), trading: false },
  ]
}

export const DAY_START = m(8, 45)
export const DAY_END = m(16, 15)

/** Weekday (0 Sun..6 Sat) and minutes after midnight in Jakarta. */
export function wibNow(d = new Date()) {
  const w = new Date(d.getTime() + 7 * 3600e3)
  return { dow: w.getUTCDay(), mins: w.getUTCHours() * 60 + w.getUTCMinutes() + w.getUTCSeconds() / 60 }
}

export type SessionState = { label: string; detail: string; tone: "live" | "pause" | "closed"; phase: Phase | null }

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}.${String(Math.floor(mins % 60)).padStart(2, "0")}`

/** What the exchange is doing now. `holiday` comes from the API (a weekday with no session). */
export function sessionState(now = new Date(), holiday = false): SessionState {
  const { dow, mins } = wibNow(now)
  const weekend = dow === 0 || dow === 6
  if (weekend || holiday) {
    return { label: weekend ? "Akhir pekan" : "Libur bursa", detail: "Bursa tutup hari ini", tone: "closed", phase: null }
  }
  const phases = schedule(dow)
  if (mins < DAY_START) return { label: "Belum buka", detail: `Pra-pembukaan ${hhmm(DAY_START)} WIB`, tone: "closed", phase: null }
  if (mins >= DAY_END) return { label: "Tutup", detail: "Sesi hari ini selesai 16.15 WIB", tone: "closed", phase: null }
  const p = phases.find((x) => mins >= x.start && mins < x.end) ?? null
  if (!p) return { label: "Tutup", detail: "", tone: "closed", phase: null }
  return {
    label: p.label,
    detail: `${hhmm(p.start)}–${hhmm(p.end)} WIB`,
    tone: p.trading ? "live" : "pause",
    phase: p,
  }
}

export { hhmm }
