import * as React from "react"
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type AutoscaleInfoProvider,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/*
 * Dens-UI charts.
 *
 *   CandlestickChart  price over time: OHLC candles, volume, moving average   lightweight-charts
 *   AreaChart         change over time, one or more series                    lightweight-charts
 *   LineChart         AreaChart without the fill                              lightweight-charts
 *   BarChart          magnitude per category (columns)                        SVG
 *   DonutChart        parts of a whole, with a centre total                   SVG
 *   BarList           ranked shares, e.g. sales by channel                    HTML
 *   SegmentedBar      one whole split into parts, shares printed inside       HTML
 *
 * Time series run on TradingView lightweight-charts (Apache-2.0,
 * https://github.com/tradingview/lightweight-charts). Keep its attribution
 * logo on, or credit TradingView with a link on the page, as its licence asks.
 *
 * Shared rules
 *   colour      series take --chart-1 … --chart-5 in that fixed order; never cycled
 *   marks       lines 2px, columns ≤ 24px with a 4px rounded end, 2px surface gaps
 *   text        axis, legend and values use text tokens, never the series colour
 *   theme       canvas colours are read from the tokens and follow light/dark live
 *   hover       crosshair + one readout on time series, per-mark tooltips on bars
 *   keyboard    every plot is focusable; ← → move the readout
 *   a11y        each chart carries a visually hidden data table
 */

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
/** text that sits inside a filled series colour (SegmentedBar) */
const INK_ON = ["text-[#04110f]", "text-[#1f1100]", "text-white", "text-[#1a1700]", "text-white dark:text-[#1d0614]"]

export type ChartSeries = { key: string; name: string; color?: string }
type Row = Record<string, string | number>
type Formatter = (n: number) => string

/** the page's language decides number, month and axis wording (ihsg: id-ID) */
const LOCALE = (typeof document !== "undefined" && document.documentElement.lang) || "en-US"
const ID = LOCALE.toLowerCase().startsWith("id")
const defaultFormat: Formatter = (n) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)
const compactFormat: Formatter = (n) =>
  Math.abs(n) >= 10_000 ? new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n) : new Intl.NumberFormat(LOCALE).format(n)
const PCT_FMT = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** -1 / 0 / 1 at two-decimal display precision, so a change that prints as 0,00 is never coloured */
const flatDir = (v: number) => {
  const r = Math.round(v * 100)
  return r === 0 ? 0 : r > 0 ? 1 : -1
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** clean tick values covering [min, max] */
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return { lo, hi, ticks }
}

/** room for the widest y tick label (11px tabular figures ≈ 6.6px per character) */
function axisWidth(labels: string[]) {
  return Math.ceil(Math.max(...labels.map((l) => l.length)) * 6.6) + 14
}

/** every k-th x label so labels never collide */
function labelEvery(n: number, plotWidth: number, minGap = 64) {
  return Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotWidth / minGap))))
}

function keyNav(e: React.KeyboardEvent, n: number, active: number | null, set: (i: number | null) => void) {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault()
    const cur = active ?? n - 1
    set(Math.min(n - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1))))
  } else if (e.key === "Home") set(0)
  else if (e.key === "End") set(n - 1)
  else if (e.key === "Escape") set(null)
}

export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const flip = x > width / 2
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-xl bg-popover px-3 py-2 text-[12.5px] text-popover-foreground shadow-raised ring-1 ring-border/70"
      style={{ left: x, top: y, transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)` }}
    >
      {children}
    </div>
  )
}

/** value first, series second; a short line key carries identity */
export function TooltipRow({ color, name, value, shape = "line" }: { color: string; name: string; value: string; shape?: "line" | "rect" }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap py-0.5">
      <span aria-hidden className={shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: color }} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{name}</span>
    </div>
  )
}

export function ChartLegend({ items, shape = "rect", className }: { items: { name: string; color: string }[]; shape?: "line" | "rect"; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground", className)}>
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-1.5">
          <span aria-hidden className={shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: it.color }} />
          {it.name}
        </li>
      ))}
    </ul>
  )
}

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>
        ))}
      </tbody>
    </table>
  )
}

const axisText = "fill-muted-foreground text-[11px] tabular-nums"

/* ------------------------------------------------------------------ */
/* lightweight-charts bridge                                           */
/* ------------------------------------------------------------------ */

/*
 * The time-series charts draw through TradingView's lightweight-charts
 * (Apache-2.0, https://www.tradingview.com/). The library paints on canvas,
 * so every colour is read from the Dens-UI tokens at runtime and re-read
 * when the theme changes. Its attribution logo stays on, as the licence asks.
 */

let probe: CanvasRenderingContext2D | null | undefined

/** any CSS colour, including var(--token), as an rgba() string the canvas understands */
function resolveColor(el: Element, color: string, alpha = 1) {
  const v = color.match(/^var\((--[\w-]+)\)$/)
  const raw = v ? getComputedStyle(el).getPropertyValue(v[1]).trim() : color
  if (probe === undefined) {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    probe = canvas.getContext("2d", { willReadFrequently: true })
  }
  if (!probe) return raw
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = "rgba(0, 0, 0, 0)"
  probe.fillStyle = raw
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${+((a / 255) * alpha).toFixed(3)})`
}

const alphaOf = (rgba: string) => Number(rgba.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1)

/** the first painted background behind the chart, so the canvas sits on its real surface */
function surfaceBehind(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const bg = resolveColor(n, getComputedStyle(n).backgroundColor)
    if (alphaOf(bg) > 0.98) return bg
  }
  return resolveColor(el, "var(--background)")
}

export type ChartTheme = ReturnType<typeof readTheme>

export function readTheme(el: HTMLElement) {
  const color = (c: string, alpha?: number) => resolveColor(el, c, alpha)
  return {
    color,
    surface: surfaceBehind(el),
    text: color("var(--muted-foreground)"),
    grid: color("var(--border)"),
    crosshair: color("var(--muted-foreground)", 0.55),
    label: color("var(--foreground)"),
    up: color("var(--chart-up)"),
    down: color("var(--chart-down)"),
    font: getComputedStyle(el).fontFamily,
  }
}

/** bumps whenever the page theme may have changed: the .dark class, inline tokens, OS scheme, late fonts */
export function useThemeVersion() {
  const [version, setVersion] = React.useState(0)
  React.useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    const mo = new MutationObserver(bump)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", bump)
    let alive = true
    document.fonts?.ready.then(() => alive && bump())
    return () => {
      alive = false
      mo.disconnect()
      mq.removeEventListener("change", bump)
    }
  }, [])
  return version
}

export function themeOptions(t: ChartTheme): DeepPartial<ChartOptions> {
  const line = { color: t.crosshair, width: 1 as const, style: LineStyle.Solid, labelBackgroundColor: t.label }
  return {
    // transparent, so patterned surfaces show through; the rgb still tells the library
    // whether it sits on light or dark, which picks the attribution logo's ink
    layout: { background: { type: ColorType.Solid, color: t.surface.replace(/[\d.]+\)$/, "0)") }, textColor: t.text, fontFamily: t.font, fontSize: 11, attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: t.grid } },
    timeScale: { borderColor: t.grid },
    crosshair: { vertLine: line, horzLine: line },
  }
}

export const baseOptions: DeepPartial<ChartOptions> = {
  autoSize: true,
  rightPriceScale: { borderVisible: false },
  leftPriceScale: { borderVisible: false },
  timeScale: { fixLeftEdge: true, fixRightEdge: true, ticksVisible: false, lockVisibleTimeRangeOnResize: true },
  // the page keeps vertical swipes and the mouse wheel; the chart keeps drags and pinches
  handleScroll: { mouseWheel: false, vertTouchDrag: false },
  handleScale: { mouseWheel: false },
}

/** keep every point in view as the container resizes */
function fitOnResize(chart: IChartApi) {
  const ts = chart.timeScale()
  const fit = () => ts.fitContent()
  ts.subscribeSizeChange(fit)
  return () => ts.unsubscribeSizeChange(fit)
}

/*
 * Time axis. ISO dates ("2026-09-01") and unix seconds give a real time axis.
 * Any other key ("Jan", "W1") is a category: it gets a stand-in day per row
 * and the axis prints the label back.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY = 86_400

function nativeDate(t: Time) {
  if (typeof t === "number") return new Date(t * 1000)
  if (typeof t === "string") return new Date(`${t}T00:00:00Z`)
  return new Date(Date.UTC(t.year, t.month - 1, t.day))
}

const MONTHS = ID
  ? ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
  : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "17 Sep 2026", plus "14:30" for intraday data (UTC, like the axis) */
function formatDay(d: Date, withClock: boolean) {
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  const sep = ID ? "." : ":"
  return withClock ? `${day} ${String(d.getUTCHours()).padStart(2, "0")}${sep}${String(d.getUTCMinutes()).padStart(2, "0")}` : day
}

function timeAxis(keys: (string | number)[]) {
  const native = keys.length > 0 && keys.every((k) => typeof k === "number" || ISO_DAY.test(k))
  const withClock = native && keys.some((k) => typeof k === "number")
  const times: Time[] = keys.map((k, i) => (native ? (k as Time) : (((i + 1) * DAY) as UTCTimestamp)))
  const label = (t: Time) => (native ? formatDay(nativeDate(t), withClock) : String(keys[Math.round(Number(t) / DAY) - 1] ?? ""))
  return { native, withClock, times, label }
}
type TimeAxis = ReturnType<typeof timeAxis>

/** stable formatter callbacks that always read the latest axis and props */
function axisOptions(axis: React.RefObject<TimeAxis>, price: React.RefObject<Formatter>): DeepPartial<ChartOptions> {
  return {
    localization: {
      locale: LOCALE,
      priceFormatter: (p: number) => price.current(p),
      timeFormatter: (t: Time) => axis.current.label(t),
    },
    timeScale: {
      tickMarkFormatter: (t: Time) => (axis.current.native ? null : axis.current.label(t)),
    },
  }
}

export const plotFocus = "relative w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"

/** ← → Home End move the crosshair, Escape clears it */
function useCrosshairKeys(
  n: number,
  active: number | null,
  setActive: (i: number | null) => void,
  place: (i: number) => void,
  clear: () => void
) {
  return (e: React.KeyboardEvent) => {
    let next: number | null | undefined
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = Math.min(n - 1, Math.max(0, (active ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1)))
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = n - 1
    else if (e.key === "Escape") next = null
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
    if (next == null) clear()
    else place(next)
  }
}

/* ------------------------------------------------------------------ */
/* CandlestickChart                                                    */
/* ------------------------------------------------------------------ */

export type Candle = {
  /** "2026-09-01" or unix seconds for a real time axis; any other string is a plain label */
  time: string | number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

function movingAverage(data: Candle[], period: number) {
  return data.map((_, i) => {
    if (i < period - 1) return null
    let s = 0
    for (let j = i - period + 1; j <= i; j++) s += data[j].close
    return s / period
  })
}

type CandleApi = {
  chart: IChartApi
  candles: ISeriesApi<"Candlestick">
  volume: ISeriesApi<"Histogram"> | null
  ma: ISeriesApi<"Line"> | null
}

export function CandlestickChart({
  data,
  label = "Price",
  height = 360,
  priceFormatter = defaultFormat,
  volumeFormatter = compactFormat,
  showVolume = true,
  movingAveragePeriod,
  className,
}: {
  /** oldest first, one row per period */
  data: Candle[]
  /** accessible name and table caption, e.g. "LMBG / IDR, daily" */
  label?: string
  height?: number
  priceFormatter?: Formatter
  volumeFormatter?: Formatter
  showVolume?: boolean
  /** draw a simple moving average of the close, e.g. 20 */
  movingAveragePeriod?: number
  className?: string
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const api = React.useRef<CandleApi | null>(null)
  const [active, setActive] = React.useState<number | null>(null)
  const themeVersion = useThemeVersion()

  const axis = React.useMemo(() => timeAxis(data.map((d) => d.time)), [data])
  const axisRef = React.useRef(axis)
  const priceRef = React.useRef(priceFormatter)
  axisRef.current = axis
  priceRef.current = priceFormatter
  const n = data.length
  const nRef = React.useRef(n)
  nRef.current = n

  // build once per shape of chart; the library owns the canvas from here
  React.useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const chart = createChart(el, {
      ...baseOptions,
      ...axisOptions(axisRef, priceRef),
      timeScale: { ...baseOptions.timeScale, ...axisOptions(axisRef, priceRef).timeScale, timeVisible: axisRef.current.withClock },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: showVolume ? 0.27 : 0.08 } },
    })
    const volume = showVolume
      ? chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false })
      : null
    volume?.priceScale().applyOptions({ scaleMargins: { top: 0.81, bottom: 0 }, visible: false })
    const candles = chart.addSeries(CandlestickSeries, {
      borderVisible: true,
      priceLineStyle: LineStyle.Solid,
      priceLineWidth: 1,
    })
    const ma = movingAveragePeriod
      ? chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      : null
    api.current = { chart, candles, volume, ma }

    const onMove = (p: MouseEventParams) => {
      if (p.time === undefined || p.logical === undefined || !p.point) return setActive(null)
      setActive(Math.min(nRef.current - 1, Math.max(0, Math.round(p.logical))))
    }
    chart.subscribeCrosshairMove(onMove)
    const unfit = fitOnResize(chart)
    return () => {
      unfit()
      chart.unsubscribeCrosshairMove(onMove)
      api.current = null
      chart.remove()
    }
  }, [showVolume, movingAveragePeriod])

  // data
  React.useLayoutEffect(() => {
    const a = api.current
    if (!a) return
    const t = axis.times
    a.chart.applyOptions({ timeScale: { timeVisible: axis.withClock } })
    a.candles.setData(data.map((d, i) => ({ time: t[i], open: d.open, high: d.high, low: d.low, close: d.close })))
    a.volume?.setData(data.map((d, i) => ({ time: t[i], value: d.volume ?? 0 })))
    if (a.ma && movingAveragePeriod) {
      const avg = movingAverage(data, movingAveragePeriod)
      a.ma.setData(avg.map((v, i) => (v == null ? { time: t[i] } : { time: t[i], value: v })))
    }
    a.chart.timeScale().fitContent()
  }, [data, axis, showVolume, movingAveragePeriod])

  // theme: tokens are re-read on every light/dark switch
  React.useLayoutEffect(() => {
    const a = api.current
    const el = host.current
    if (!a || !el) return
    const th = readTheme(el)
    a.chart.applyOptions(themeOptions(th))
    // up candles hollow, down candles filled: direction never rests on colour alone
    a.candles.applyOptions({
      upColor: "rgba(0, 0, 0, 0)",
      downColor: th.down,
      borderUpColor: th.up,
      borderDownColor: th.down,
      wickUpColor: th.up,
      wickDownColor: th.down,
      // the hollow up body is transparent, so name the last-price colour outright
      priceLineColor: n && data[n - 1].close < data[n - 1].open ? th.down : th.up,
    })
    a.ma?.applyOptions({ color: th.color("var(--chart-3)") })
    if (a.volume) {
      const upV = th.color("var(--chart-up)", 0.3)
      const downV = th.color("var(--chart-down)", 0.3)
      a.volume.setData(data.map((d, i) => ({ time: axis.times[i], value: d.volume ?? 0, color: d.close >= d.open ? upV : downV })))
    }
  }, [themeVersion, data, axis, n, showVolume, movingAveragePeriod])

  const keys = useCrosshairKeys(
    n,
    active,
    setActive,
    (i) => api.current && api.current.chart.setCrosshairPosition(data[i].close, axis.times[i], api.current.candles),
    () => api.current?.chart.clearCrosshairPosition()
  )

  if (n === 0) return null
  const last = data[n - 1]
  const shown = active != null ? data[active] : last
  const shownPrev = active != null ? data[active - 1] ?? data[active] : data[n - 2] ?? last
  const change = shown.close - shownPrev.close
  const changePct = shownPrev.close ? (change / shownPrev.close) * 100 : 0

  return (
    <div className={cn("relative w-full", className)}>
      {/* readout: values lead */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]" aria-live="polite">
        <span className="flex items-baseline gap-2">
          <span className="text-[22px] font-bold tracking-[-0.02em] tabular-nums">{priceFormatter(shown.close)}</span>
          {/* flat is flat: no arrow and no direction colour at a change that prints as zero */}
          <span className={cn("flex items-center gap-1 self-center font-semibold tabular-nums", flatDir(changePct) > 0 ? "text-chart-up" : flatDir(changePct) < 0 ? "text-chart-down" : "text-muted-foreground")}>
            {flatDir(changePct) > 0 ? <ArrowUpRightIcon className="size-3.5" aria-label={ID ? "naik" : "up"} /> : flatDir(changePct) < 0 ? <ArrowDownRightIcon className="size-3.5" aria-label={ID ? "turun" : "down"} /> : null}
            {priceFormatter(Math.abs(change))} ({flatDir(changePct) > 0 ? "+" : flatDir(changePct) < 0 ? "−" : ""}
            {PCT_FMT.format(Math.abs(changePct))}%)
          </span>
        </span>
        <span className="flex flex-wrap gap-x-3 text-muted-foreground tabular-nums">
          <span>{axis.label(axis.times[active ?? n - 1])}</span>
          <span>O <b className="font-semibold text-foreground">{priceFormatter(shown.open)}</b></span>
          <span>H <b className="font-semibold text-foreground">{priceFormatter(shown.high)}</b></span>
          <span>L <b className="font-semibold text-foreground">{priceFormatter(shown.low)}</b></span>
          <span>C <b className="font-semibold text-foreground">{priceFormatter(shown.close)}</b></span>
          {shown.volume != null && <span>Vol <b className="font-semibold text-foreground">{volumeFormatter(shown.volume)}</b></span>}
        </span>
      </div>

      <div
        ref={host}
        role="group"
        aria-roledescription="chart"
        aria-label={ID ? `${label}. Penutupan terakhir ${priceFormatter(last.close)}. Panah kiri dan kanan membaca tiap candle.` : `${label}. Last close ${priceFormatter(last.close)}. Use the left and right arrow keys to read each candle.`}
        tabIndex={0}
        className={plotFocus}
        style={{ height }}
        onKeyDown={keys}
        onBlur={() => {
          setActive(null)
          api.current?.chart.clearCrosshairPosition()
        }}
      />
      <ChartLegend
        className="mt-3"
        shape="line"
        items={[
          { name: ID ? "Naik: berongga" : "Up: hollow", color: "var(--chart-up)" },
          { name: ID ? "Turun: berisi" : "Down: filled", color: "var(--chart-down)" },
          ...(movingAveragePeriod ? [{ name: `MA ${movingAveragePeriod}`, color: "var(--chart-3)" }] : []),
        ]}
      />
      <SrTable
        caption={label}
        head={ID ? ["Waktu", "Buka", "Tertinggi", "Terendah", "Tutup", "Volume"] : ["Time", "Open", "High", "Low", "Close", "Volume"]}
        rows={data.map((d, i) => [axis.label(axis.times[i]), priceFormatter(d.open), priceFormatter(d.high), priceFormatter(d.low), priceFormatter(d.close), d.volume != null ? volumeFormatter(d.volume) : ""])}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* AreaChart / LineChart                                               */
/* ------------------------------------------------------------------ */

type LineApi = { chart: IChartApi; series: ISeriesApi<"Area" | "Line">[] }
type Dot = { x: number; y: number; color: string }

/** keep 0 on the value axis, so areas fill down to a true baseline */
const fromZero: AutoscaleInfoProvider = (original) => {
  const r = original()
  if (!r?.priceRange) return r
  return { ...r, priceRange: { minValue: Math.min(0, r.priceRange.minValue), maxValue: r.priceRange.maxValue } }
}

export function AreaChart({
  data,
  index,
  series,
  label = "Chart",
  height = 260,
  valueFormatter = compactFormat,
  area,
  className,
}: {
  /** oldest first */
  data: Row[]
  /** key of the x value in each row: a category ("Jan"), an ISO date or unix seconds */
  index: string
  series: ChartSeries[]
  label?: string
  height?: number
  valueFormatter?: Formatter
  /** fill under the line; on by default for a single series */
  area?: boolean
  className?: string
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const api = React.useRef<LineApi | null>(null)
  const remeasure = React.useRef<() => void>(() => {})
  const [active, setActive] = React.useState<number | null>(null)
  const [dots, setDots] = React.useState<Dot[]>([])
  const [frame, setFrame] = React.useState({ left: 0, width: 0, plotH: 0 })
  const themeVersion = useThemeVersion()
  const colors = series.map((s, i) => s.color ?? CHART_COLORS[i % CHART_COLORS.length])
  const fill = area ?? series.length === 1
  const shape = `${fill}|${series.map((s) => s.key).join(",")}`

  const axis = React.useMemo(() => timeAxis(data.map((d) => d[index])), [data, index])
  const axisRef = React.useRef(axis)
  const fmtRef = React.useRef(valueFormatter)
  axisRef.current = axis
  fmtRef.current = valueFormatter
  const n = data.length
  const nRef = React.useRef(n)
  nRef.current = n
  const dataRef = React.useRef(data)
  dataRef.current = data
  const seriesRef = React.useRef(series)
  seriesRef.current = series
  const colorsRef = React.useRef(colors)
  colorsRef.current = colors

  React.useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const chart = createChart(el, {
      ...baseOptions,
      ...axisOptions(axisRef, fmtRef),
      timeScale: { ...baseOptions.timeScale, ...axisOptions(axisRef, fmtRef).timeScale },
      crosshair: { mode: CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
      leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.08, bottom: 0 } },
      rightPriceScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    })
    const common = {
      priceScaleId: "left",
      lineWidth: 2 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 4.5,
      crosshairMarkerBorderWidth: 2,
      autoscaleInfoProvider: fromZero,
    }
    const made = seriesRef.current.map(() => (fill ? chart.addSeries(AreaSeries, common) : chart.addSeries(LineSeries, common)))
    api.current = { chart, series: made }

    // end markers and the tooltip frame are DOM, placed from the library's coordinates
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rows = dataRef.current
        const last = rows.length - 1
        if (last < 0) return setDots([])
        const left = chart.priceScale("left").width()
        const x = chart.timeScale().timeToCoordinate(axisRef.current.times[last])
        setFrame({ left, width: el.clientWidth, plotH: chart.paneSize().height })
        setDots(
          made.flatMap((s, i) => {
            const y = s.priceToCoordinate(Number(rows[last][seriesRef.current[i].key]))
            return x == null || y == null ? [] : [{ x: left + x, y, color: colorsRef.current[i] }]
          })
        )
      })
    }
    const ts = chart.timeScale()
    ts.subscribeVisibleLogicalRangeChange(measure)
    ts.subscribeSizeChange(measure)
    const onMove = (p: MouseEventParams) => {
      if (p.time === undefined || p.logical === undefined || !p.point) return setActive(null)
      setActive(Math.min(nRef.current - 1, Math.max(0, Math.round(p.logical))))
    }
    chart.subscribeCrosshairMove(onMove)
    const unfit = fitOnResize(chart)
    remeasure.current = measure
    return () => {
      cancelAnimationFrame(raf)
      unfit()
      ts.unsubscribeVisibleLogicalRangeChange(measure)
      ts.unsubscribeSizeChange(measure)
      chart.unsubscribeCrosshairMove(onMove)
      remeasure.current = () => {}
      api.current = null
      chart.remove()
    }
  }, [shape]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useLayoutEffect(() => {
    const a = api.current
    if (!a) return
    a.series.forEach((s, i) => {
      const key = series[i].key
      s.setData(data.map((d, j) => ({ time: axis.times[j], value: Number(d[key]) })))
    })
    a.chart.timeScale().fitContent()
    remeasure.current()
  }, [data, axis, shape]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useLayoutEffect(() => {
    const a = api.current
    const el = host.current
    if (!a || !el) return
    const th = readTheme(el)
    a.chart.applyOptions(themeOptions(th))
    a.chart.applyOptions({ crosshair: { horzLine: { visible: false, labelVisible: false } } })
    a.series.forEach((s, i) => {
      const c = th.color(colors[i])
      const ring = { crosshairMarkerBackgroundColor: c, crosshairMarkerBorderColor: th.surface }
      if (fill) {
        const wash = th.color(colors[i], 0.1)
        ;(s as ISeriesApi<"Area">).applyOptions({ lineColor: c, topColor: wash, bottomColor: wash, ...ring })
      } else (s as ISeriesApi<"Line">).applyOptions({ color: c, ...ring })
    })
    remeasure.current()
  }, [themeVersion, shape, colors.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const keys = useCrosshairKeys(
    n,
    active,
    setActive,
    (i) => {
      const a = api.current
      if (a?.series[0]) a.chart.setCrosshairPosition(Number(data[i][series[0].key]), axis.times[i], a.series[0])
    },
    () => api.current?.chart.clearCrosshairPosition()
  )

  const activeX = active != null ? api.current?.chart.timeScale().timeToCoordinate(axis.times[active]) : null

  return (
    <div className={cn("relative w-full", className)}>
      {series.length > 1 && <ChartLegend className="mb-3" shape="line" items={series.map((s, i) => ({ name: s.name, color: colors[i] }))} />}
      <div
        role="group"
        aria-roledescription="chart"
        aria-label={`${label}. Use the left and right arrow keys to read each point.`}
        tabIndex={0}
        className={plotFocus}
        style={{ height }}
        onKeyDown={keys}
        onBlur={() => {
          setActive(null)
          api.current?.chart.clearCrosshairPosition()
        }}
      >
        <div ref={host} className="absolute inset-0" />
        {/* end markers carry a 2px surface ring */}
        {dots.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute z-[2] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
            style={{ left: d.x, top: d.y, background: d.color, opacity: active != null && active !== n - 1 ? 0.5 : 1 }}
          />
        ))}
        {active != null && activeX != null && frame.width > 0 && (
          <ChartTooltip x={frame.left + activeX} y={frame.plotH / 2} width={frame.width}>
            <div className="mb-1 text-muted-foreground">{axis.label(axis.times[active])}</div>
            {series.map((s, si) => (
              <TooltipRow key={s.key} color={colors[si]} name={s.name} value={valueFormatter(Number(data[active][s.key]))} />
            ))}
          </ChartTooltip>
        )}
      </div>
      <SrTable
        caption={label}
        head={[index, ...series.map((s) => s.name)]}
        rows={data.map((d, i) => [axis.label(axis.times[i]), ...series.map((s) => valueFormatter(Number(d[s.key])))])}
      />
    </div>
  )
}

/** AreaChart without the fill: for several series that cross, or any trend where the baseline is not the point */
export function LineChart(props: Omit<React.ComponentProps<typeof AreaChart>, "area">) {
  return <AreaChart {...props} area={false} />
}

/* ------------------------------------------------------------------ */
/* BarChart                                                            */
/* ------------------------------------------------------------------ */

export function BarChart({
  data,
  index,
  series,
  label = "Chart",
  height = 260,
  valueFormatter = compactFormat,
  className,
}: {
  data: Row[]
  index: string
  /** one series, or a few grouped side by side */
  series: ChartSeries[]
  label?: string
  height?: number
  valueFormatter?: Formatter
  className?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = React.useState<number | null>(null)
  const colors = series.map((s, i) => s.color ?? CHART_COLORS[i % CHART_COLORS.length])

  const n = data.length
  const values = data.flatMap((d) => series.map((s) => Number(d[s.key])))
  const { lo, hi, ticks } = niceTicks(0, Math.max(...values), 4)
  const left = axisWidth(ticks.map(valueFormatter))
  const right = 8
  const top = 12
  const bottom = 28
  const plotW = Math.max(0, width - left - right)
  const plotH = height - top - bottom
  const band = plotW / Math.max(1, n)
  const gap = 2
  const barW = Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length)
  const groupW = barW * series.length + gap * (series.length - 1)
  const yOf = (v: number) => top + ((hi - v) / (hi - lo)) * plotH
  const every = labelEvery(n, plotW, 48)

  return (
    <div className={cn("relative w-full", className)}>
      {series.length > 1 && <ChartLegend className="mb-3" items={series.map((s, i) => ({ name: s.name, color: colors[i] }))} />}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${label}. Use the left and right arrow keys to read each bar.`}
            tabIndex={0}
            className="block touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerLeave={() => setActive(null)}
            onKeyDown={(e) => keyNav(e, n, active, setActive)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={left + plotW} y1={yOf(t)} y2={yOf(t)} className="stroke-border" shapeRendering="crispEdges" />
                <text x={left - 10} y={yOf(t)} dy="0.32em" textAnchor="end" className={axisText}>
                  {valueFormatter(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = left + i * band + (band - groupW) / 2
              return (
                <g key={i} opacity={active != null && active !== i ? 0.45 : 1} onPointerEnter={() => setActive(i)}>
                  {/* the hit target is the whole band, not the painted bar */}
                  <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent" />
                  {series.map((s, si) => {
                    const v = Number(d[s.key])
                    const y = yOf(v)
                    const h = yOf(lo) - y
                    const x = x0 + si * (barW + gap)
                    const r = Math.min(4, barW / 2, h)
                    // 4px rounded data end, square at the baseline
                    return (
                      <path
                        key={s.key}
                        d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + h}Z`}
                        fill={colors[si]}
                      />
                    )
                  })}
                  {i % every === 0 && (
                    <text x={left + i * band + band / 2} y={height - 8} textAnchor="middle" className={axisText}>
                      {String(d[index])}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {active != null && width > 0 && (
          <ChartTooltip x={left + active * band + band / 2} y={top + plotH / 2} width={width}>
            <div className="mb-1 text-muted-foreground">{String(data[active][index])}</div>
            {series.map((s, si) => (
              <TooltipRow key={s.key} shape="rect" color={colors[si]} name={s.name} value={valueFormatter(Number(data[active][s.key]))} />
            ))}
          </ChartTooltip>
        )}
      </div>
      <SrTable
        caption={label}
        head={[index, ...series.map((s) => s.name)]}
        rows={data.map((d) => [String(d[index]), ...series.map((s) => valueFormatter(Number(d[s.key])))])}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* DonutChart                                                          */
/* ------------------------------------------------------------------ */

export type Slice = { name: string; value: number; color?: string }

export function DonutChart({
  data,
  label = "Share",
  size = 200,
  thickness = 26,
  centerLabel = "Total",
  valueFormatter = compactFormat,
  showLegend = true,
  className,
}: {
  data: Slice[]
  label?: string
  size?: number
  thickness?: number
  /** caption under the total in the middle */
  centerLabel?: string
  valueFormatter?: Formatter
  showLegend?: boolean
  className?: string
}) {
  const [active, setActive] = React.useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const colors = data.map((d, i) => d.color ?? CHART_COLORS[i % CHART_COLORS.length])
  const r = size / 2
  const rOut = r - 2
  const rIn = rOut - thickness
  const gapAngle = 2 / ((rOut + rIn) / 2) // a 2px surface gap at the ring's middle
  const pct = (v: number) => (total ? (v / total) * 100 : 0)

  let a0 = -Math.PI / 2
  const arcs = data.map((d) => {
    const sweep = total ? (d.value / total) * Math.PI * 2 : 0
    const start = a0 + (data.length > 1 ? gapAngle / 2 : 0)
    const end = a0 + sweep - (data.length > 1 ? gapAngle / 2 : 0)
    a0 += sweep
    return { start, end: Math.max(start, end) }
  })
  const pt = (rad: number, a: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`
  const arcPath = (s: number, e: number) => {
    if (e - s >= Math.PI * 2 - 1e-6) e = s + Math.PI * 2 - 1e-4
    const large = e - s > Math.PI ? 1 : 0
    return `M${pt(rOut, s)}A${rOut},${rOut} 0 ${large} 1 ${pt(rOut, e)}L${pt(rIn, e)}A${rIn},${rIn} 0 ${large} 0 ${pt(rIn, s)}Z`
  }
  const shown = active != null ? data[active] : null

  return (
    <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={`${label}. ${data.map((d) => `${d.name} ${pct(d.value).toFixed(1)}%`).join(", ")}.`}
          tabIndex={0}
          className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => keyNav(e, data.length, active, setActive)}
        >
          {arcs.map((a, i) => (
            <path
              key={data[i].name}
              d={arcPath(a.start, a.end)}
              fill={colors[i]}
              opacity={active != null && active !== i ? 0.3 : 1}
              className="transition-opacity duration-150"
              onPointerEnter={() => setActive(i)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="font-bold leading-none tracking-[-0.02em]" style={{ fontSize: Math.round(Math.min(28, Math.max(18, size * 0.13))) }}>
            {shown ? `${pct(shown.value).toFixed(1)}%` : valueFormatter(total)}
          </span>
          <span className="mt-1 max-w-[12ch] truncate text-[12px] text-muted-foreground">{shown ? shown.name : centerLabel}</span>
        </div>
      </div>
      {showLegend && (
        <ul className="grid min-w-[200px] flex-1 gap-1 text-[13px]">
          {data.map((d, i) => (
            <li
              key={d.name}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              className={cn(
                "grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 transition-colors",
                active === i && "bg-muted"
              )}
            >
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: colors[i] }} />
              <span className="truncate">{d.name}</span>
              <span className="font-semibold tabular-nums">{valueFormatter(d.value)}</span>
              <span className="w-12 text-right tabular-nums text-muted-foreground">{pct(d.value).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      )}
      <SrTable caption={label} head={["Part", "Value", "Share"]} rows={data.map((d) => [d.name, valueFormatter(d.value), `${pct(d.value).toFixed(1)}%`])} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* BarList                                                             */
/* ------------------------------------------------------------------ */

export function BarList({
  data,
  label = "Ranking",
  valueFormatter = compactFormat,
  showShare = true,
  color = "var(--chart-1)",
  className,
}: {
  data: { name: string; value: number; href?: string }[]
  label?: string
  valueFormatter?: Formatter
  /** print each row's share of the total */
  showShare?: boolean
  color?: string
  className?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul aria-label={label} className={cn("grid gap-3.5", className)}>
      {data.map((d) => {
        const share = total ? (d.value / total) * 100 : 0
        return (
          <li key={d.name} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              {d.href ? (
                <a href={d.href} className="truncate hover:underline">
                  {d.name}
                </a>
              ) : (
                <span className="truncate">{d.name}</span>
              )}
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="font-semibold">{valueFormatter(d.value)}</span>
                {showShare && <span className="w-11 text-right text-[12.5px] text-muted-foreground">{share.toFixed(1)}%</span>}
              </span>
            </div>
            {/* track is a lighter step of the same hue */}
            <div className="h-2 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
              <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* SegmentedBar                                                        */
/* ------------------------------------------------------------------ */

export function SegmentedBar({
  data,
  label = "Share",
  valueFormatter = compactFormat,
  className,
}: {
  data: Slice[]
  label?: string
  valueFormatter?: Formatter
  className?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = React.useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const colors = data.map((d, i) => d.color ?? CHART_COLORS[i % CHART_COLORS.length])
  const parts = data.filter((d) => d.value > 0)
  const gaps = (parts.length - 1) * 2
  return (
    <div className={cn("relative grid gap-3", className)}>
      <div
        ref={ref}
        role="img"
        aria-label={`${label}. ${data.map((d) => `${d.name} ${((d.value / total) * 100).toFixed(1)}%`).join(", ")}.`}
        className="relative flex h-7 w-full gap-0.5"
        onPointerLeave={() => setActive(null)}
      >
        {data.map((d, i) => {
          if (d.value <= 0) return null
          const share = (d.value / total) * 100
          const px = ((width - gaps) * d.value) / total
          return (
            <div
              key={d.name}
              className={cn("flex h-full items-center overflow-hidden rounded-[4px] px-2 text-[12px] font-semibold tabular-nums transition-opacity", INK_ON[i % INK_ON.length])}
              style={{ flex: `${d.value} 1 0`, background: colors[i], opacity: active != null && active !== i ? 0.45 : 1 }}
              onPointerEnter={() => setActive(i)}
            >
              {/* print the share only when it fits */}
              {px >= 44 ? `${Math.round(share)}%` : null}
            </div>
          )
        })}
      </div>
      <ChartLegend items={data.map((d, i) => ({ name: d.name, color: colors[i] }))} />
      {active != null && (
        <div className="pointer-events-none absolute -top-2 left-0 -translate-y-full rounded-xl bg-popover px-3 py-2 text-[12.5px] shadow-raised ring-1 ring-border/70">
          <TooltipRow shape="rect" color={colors[active]} name={data[active].name} value={`${valueFormatter(data[active].value)} · ${((data[active].value / total) * 100).toFixed(1)}%`} />
        </div>
      )}
      <SrTable caption={label} head={["Part", "Value", "Share"]} rows={data.map((d) => [d.name, valueFormatter(d.value), `${((d.value / total) * 100).toFixed(1)}%`])} />
    </div>
  )
}
