import * as React from "react"
import {
  AreaSeries,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
  type WhitespaceData,
  type AreaData,
} from "lightweight-charts"

import { cn } from "@/lib/utils"
import * as f from "@/lib/format"
import { DAY_END, DAY_START, hhmm, schedule, wibNow } from "@/lib/session"
import { ChartTooltip, baseOptions, plotFocus, readTheme, themeOptions, useThemeVersion } from "@/components/ui/chart"

// The signature move: IHSG per minute drawn over the IDX trading day itself,
// on the Dens-UI time-series engine (TradingView Lightweight Charts, themed
// from the tokens). The time scale is the whole day, 08.45 to 16.15 WIB, one
// slot per minute; the session line (pita sesi) under the plot is aligned to
// it, and one orange marker shows "now".

export type MinuteBar = { mins: number; close: number }

/** WIB wall clock stored as UTC seconds, so the library never shifts the hour */
const stamp = (dayUtc: number, mins: number) => (dayUtc + mins * 60) as UTCTimestamp
const minsOf = (t: number, dayUtc: number) => (t - dayUtc) / 60

type Frame = { plotW: number; scaleW: number; paneH: number; x0: number; x1: number }

export function SessionChart({
  bars,
  prevClose,
  session,
  dow,
  live,
  now = new Date(),
  height = 232,
  className,
}: {
  bars: MinuteBar[]
  prevClose: number | null
  /** the session's date, "2026-11-25" */
  session: string
  /** weekday of the session (0 Sun..6 Sat), for the Friday schedule */
  dow: number
  /** the session drawn is today's, so "now" is on the line */
  live: boolean
  now?: Date
  height?: number
  className?: string
}) {
  const host = React.useRef<HTMLDivElement>(null)
  // two area series, one per trading session, so the lunch break is a real gap
  const api = React.useRef<{ chart: IChartApi; area: ISeriesApi<"Area">; pm: ISeriesApi<"Area">; prev: IPriceLine | null; last: IPriceLine | null } | null>(null)
  const remeasure = React.useRef<() => void>(() => {})
  const [frame, setFrame] = React.useState<Frame>({ plotW: 0, scaleW: 0, paneH: 0, x0: 0, x1: 0 })
  const [active, setActive] = React.useState<number | null>(null)
  const [endDot, setEndDot] = React.useState<{ x: number; y: number } | null>(null)
  const themeVersion = useThemeVersion()

  const dayUtc = React.useMemo(() => Date.parse(`${session}T00:00:00Z`) / 1000, [session])
  const phases = schedule(dow)
  const brk = phases.find((p) => p.key === "break")!
  // the lunch break is a gap: no line is drawn over it
  const shown = React.useMemo(() => bars.filter((b) => b.mins < brk.start || b.mins >= brk.end), [bars, brk.start, brk.end])
  const shownRef = React.useRef(shown)
  shownRef.current = shown

  // the morning series carries one slot per minute of the whole day (whitespace where
  // there is no bar), which fixes the time scale to 08.45-16.15; the afternoon series
  // carries only its own bars
  const series = React.useMemo(() => {
    const am = new Map(shown.filter((b) => b.mins < brk.start).map((b) => [Math.round(b.mins), b.close]))
    const day: (AreaData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] = []
    for (let m = DAY_START; m <= DAY_END; m++) {
      const v = am.get(m)
      day.push(v == null ? { time: stamp(dayUtc, m) } : { time: stamp(dayUtc, m), value: v })
    }
    const pm: AreaData<UTCTimestamp>[] = shown.filter((b) => b.mins >= brk.end).map((b) => ({ time: stamp(dayUtc, Math.round(b.mins)), value: b.close }))
    return { day, pm }
  }, [shown, dayUtc, brk.start, brk.end])

  React.useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const chart = createChart(el, {
      ...baseOptions,
      localization: { locale: "id-ID", priceFormatter: (p: number) => f.price(p, 0) },
      timeScale: { ...baseOptions.timeScale, visible: false },
      crosshair: { mode: CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
      rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.06 } },
      leftPriceScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    })
    const opts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4.5, crosshairMarkerBorderWidth: 2 }
    const area = chart.addSeries(AreaSeries, opts)
    const pm = chart.addSeries(AreaSeries, opts)
    api.current = { chart, area, pm, prev: null, last: null }

    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const ts = chart.timeScale()
        const scaleW = chart.priceScale("right").width()
        const x0 = ts.timeToCoordinate(stamp(dayUtc, DAY_START)) ?? 0
        const x1 = ts.timeToCoordinate(stamp(dayUtc, DAY_END)) ?? el.clientWidth - scaleW
        setFrame({ plotW: el.clientWidth - scaleW, scaleW, paneH: chart.paneSize().height, x0, x1 })
        const rows = shownRef.current
        const lastBar = rows[rows.length - 1]
        if (!lastBar) return setEndDot(null)
        const x = ts.timeToCoordinate(stamp(dayUtc, Math.round(lastBar.mins)))
        const y = area.priceToCoordinate(lastBar.close)
        setEndDot(x == null || y == null ? null : { x, y })
      })
    }
    const ts = chart.timeScale()
    ts.subscribeSizeChange(measure)
    ts.subscribeVisibleLogicalRangeChange(measure)
    const fit = () => ts.fitContent()
    ts.subscribeSizeChange(fit)
    const onMove = (p: MouseEventParams) => {
      if (p.time === undefined || !p.point) return setActive(null)
      const m = minsOf(Number(p.time), dayUtc)
      const rows = shownRef.current
      let best = -1
      for (let i = 0; i < rows.length; i++) if (best < 0 || Math.abs(rows[i].mins - m) < Math.abs(rows[best].mins - m)) best = i
      setActive(best < 0 || Math.abs(rows[best].mins - m) > 3 ? null : best)
    }
    chart.subscribeCrosshairMove(onMove)
    remeasure.current = measure
    return () => {
      cancelAnimationFrame(raf)
      ts.unsubscribeSizeChange(measure)
      ts.unsubscribeSizeChange(fit)
      ts.unsubscribeVisibleLogicalRangeChange(measure)
      chart.unsubscribeCrosshairMove(onMove)
      remeasure.current = () => {}
      api.current = null
      chart.remove()
    }
  }, [dayUtc])

  // data, yesterday's close and the last-price pill
  React.useLayoutEffect(() => {
    const a = api.current
    const el = host.current
    if (!a || !el) return
    a.area.setData(series.day)
    a.pm.setData(series.pm)
    a.chart.timeScale().fitContent()
    const th = readTheme(el)
    if (a.prev) a.area.removePriceLine(a.prev)
    if (a.last) a.area.removePriceLine(a.last)
    a.prev =
      prevClose != null
        ? a.area.createPriceLine({
            price: prevClose,
            color: th.color("var(--muted-foreground)", 0.8),
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            axisLabelColor: th.color("var(--secondary)"),
            axisLabelTextColor: th.text,
            title: "",
          })
        : null
    const lastBar = shown[shown.length - 1]
    a.last = lastBar
      ? a.area.createPriceLine({
          price: lastBar.close,
          color: th.color("var(--foreground)", 0),
          lineVisible: false,
          axisLabelVisible: true,
          axisLabelColor: th.label,
          axisLabelTextColor: th.color("var(--background)"),
          title: "",
        })
      : null
    remeasure.current()
  }, [series, prevClose, shown, themeVersion])

  // theme: tokens are re-read on every light/dark switch
  React.useLayoutEffect(() => {
    const a = api.current
    const el = host.current
    if (!a || !el) return
    const th = readTheme(el)
    a.chart.applyOptions(themeOptions(th))
    a.chart.applyOptions({ crosshair: { horzLine: { visible: false, labelVisible: false } } })
    const c = th.color("var(--primary)")
    const wash = th.color("var(--primary)", 0.1)
    const look = { lineColor: c, topColor: wash, bottomColor: th.color("var(--primary)", 0.02), crosshairMarkerBackgroundColor: c, crosshairMarkerBorderColor: th.surface }
    a.area.applyOptions(look)
    a.pm.applyOptions(look)
    remeasure.current()
  }, [themeVersion])

  const onKey = (e: React.KeyboardEvent) => {
    const n = shown.length
    if (!n) return
    let next: number | null | undefined
    const stepN = e.shiftKey ? 15 : 1
    if (e.key === "ArrowRight") next = Math.min(n - 1, (active ?? n - 1) + stepN)
    else if (e.key === "ArrowLeft") next = Math.max(0, (active ?? n - 1) - stepN)
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = n - 1
    else if (e.key === "Escape") next = null
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
    const a = api.current
    if (!a) return
    if (next == null) a.chart.clearCrosshairPosition()
    else a.chart.setCrosshairPosition(shown[next].close, stamp(dayUtc, Math.round(shown[next].mins)), shown[next].mins >= brk.end ? a.pm : a.area)
  }

  const nowMins = wibNow(now).mins
  const showNow = live && nowMins >= DAY_START && nowMins <= DAY_END
  const ts = api.current?.chart.timeScale()
  const xAt = (mins: number) => ts?.timeToCoordinate(stamp(dayUtc, mins)) ?? null
  const bx0 = xAt(brk.start)
  const bx1 = xAt(brk.end)
  const nowX = showNow ? xAt(Math.round(nowMins)) : null
  const a = active != null ? shown[active] : null
  const ax = a ? xAt(a.mins) : null

  const first = shown[0]
  const last = shown[shown.length - 1]
  const summary = shown.length
    ? `IHSG per menit, ${hhmm(first.mins)} sampai ${hhmm(last.mins)} WIB: dibuka ${f.price(first.close, 2)}, tertinggi ${f.price(Math.max(...shown.map((b) => b.close)), 2)}, terendah ${f.price(Math.min(...shown.map((b) => b.close)), 2)}, terakhir ${f.price(last.close, 2)}. Panah kiri dan kanan membaca tiap menit.`
    : "Belum ada data per menit untuk sesi ini."

  return (
    <div className={cn("grid gap-3", className)}>
      <div
        role="group"
        aria-roledescription="grafik"
        aria-label={summary}
        tabIndex={shown.length ? 0 : -1}
        onKeyDown={onKey}
        onBlur={() => {
          setActive(null)
          api.current?.chart.clearCrosshairPosition()
        }}
        className={plotFocus}
        style={{ height }}
      >
        {/* the lunch break, where the line has nothing to say (under the transparent canvas) */}
        {bx0 != null && bx1 != null && frame.paneH > 0 && (
          <span aria-hidden className="absolute top-0 bg-surface" style={{ left: bx0, width: bx1 - bx0, height: frame.paneH }} />
        )}
        <div ref={host} className="absolute inset-0" />
        {endDot && (
          <span
            aria-hidden
            className="pointer-events-none absolute z-[2] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
            style={{ left: endDot.x, top: endDot.y, opacity: active != null && active !== shown.length - 1 ? 0.5 : 1 }}
          />
        )}
        {/* the one orange element: now, through the plot and down onto the session line */}
        {nowX != null && frame.paneH > 0 && (
          <span aria-hidden className="pointer-events-none absolute top-0 z-[2] w-0.5 -translate-x-1/2 rounded-full bg-highlight" style={{ left: nowX, height: height + 12 + 36 }} />
        )}
        {a && ax != null && frame.plotW > 0 && (
          <ChartTooltip x={ax} y={frame.paneH / 2} width={frame.plotW}>
            <div className="mb-1 text-muted-foreground">{hhmm(a.mins)} WIB</div>
            <div className="font-semibold tabular-nums">{f.price(a.close, 2)}</div>
            {prevClose != null && (
              <div className={cn("font-semibold tabular-nums", f.dir(a.close - prevClose) > 0 ? "text-up" : f.dir(a.close - prevClose) < 0 ? "text-down" : "text-muted-foreground")}>
                {f.change(a.close - prevClose, 2)} ({f.pct(((a.close - prevClose) / prevClose) * 100)})
              </div>
            )}
          </ChartTooltip>
        )}
        {shown.length === 0 && (
          <p className="absolute inset-0 grid place-content-center text-center text-sm text-muted-foreground" style={{ right: frame.scaleW }}>
            Grafik per menit muncul setelah sesi dibuka pukul 09.00 WIB.
          </p>
        )}
      </div>

      <SessionLine dow={dow} nowMins={showNow ? nowMins : null} frame={frame} />
    </div>
  )
}

/** The trading day as a pill track, laid exactly under the chart's 08.45 to 16.15 span. */
function SessionLine({ dow, nowMins, frame }: { dow: number; nowMins: number | null; frame: Frame }) {
  const phases = schedule(dow)
  const span = DAY_END - DAY_START
  const pctOf = (mins: number) => ((mins - DAY_START) / span) * 100
  const marks = [phases[1].end, phases[3].start, phases[3].end]
  const width = Math.max(0, frame.x1 - frame.x0)
  const label = (k: string) => ({ s1: "Sesi 1", break: "Istirahat", s2: "Sesi 2" })[k as "s1"] as string | undefined
  return (
    <div
      className="relative"
      role="group"
      aria-label="Jadwal sesi perdagangan hari ini"
      style={width ? { marginLeft: frame.x0, width } : { marginRight: 60 }}
    >
      <div className="relative flex h-9 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/60">
        {phases.map((p) => {
          const w = ((p.end - p.start) / span) * 100
          const done = nowMins != null && nowMins >= p.end
          const current = nowMins != null && nowMins >= p.start && nowMins < p.end
          const name = label(p.key)
          return (
            <div
              key={p.key}
              title={`${p.label} ${hhmm(p.start)}–${hhmm(p.end)} WIB`}
              className={cn(
                "relative flex items-center justify-center border-r border-background/80 last:border-r-0",
                p.trading ? "" : "bg-[repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_srgb,var(--border)_80%,transparent)_5px_6px)]"
              )}
              style={{ width: `${w}%` }}
            >
              {(done || current) && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-primary/14"
                  style={{ width: current && nowMins != null ? `${((nowMins - p.start) / (p.end - p.start)) * 100}%` : "100%" }}
                />
              )}
              {name && (w / 100) * width > name.length * 7 + 12 && (
                <span className={cn("relative truncate px-1 text-[12px] font-semibold", current ? "text-foreground" : "text-muted-foreground")}>{name}</span>
              )}
            </div>
          )
        })}
      </div>
      {nowMins != null && (
        <span
          className="absolute -top-0.5 -translate-x-1/2 -translate-y-full rounded-full bg-highlight px-2 py-0.5 font-mono text-[11px] font-semibold text-highlight-foreground"
          style={{ left: `${pctOf(nowMins)}%` }}
        >
          {hhmm(nowMins)}
        </span>
      )}
      {/* 16.15 sits in the price-axis gutter beside the track's end */}
      <span aria-hidden className="absolute top-[18px] -translate-y-1/2 pl-2 font-mono text-[11px] text-muted-foreground" style={{ left: "100%" }}>
        16.15
      </span>
      <div className="relative mt-1.5 h-4 font-mono text-[11px] text-muted-foreground">
        <span className="absolute left-0">08.45</span>
        {marks.map((m, i) => (
          <span key={i} className={cn("absolute", i === 0 && "hidden -translate-x-1/2 sm:inline", i === 1 && "-translate-x-1/2", i === 2 && "-translate-x-full")} style={{ left: `${pctOf(m)}%` }}>
            {hhmm(m)}
          </span>
        ))}
      </div>
    </div>
  )
}
