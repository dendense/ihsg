import * as React from "react"
import { ArrowLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import * as f from "@/lib/format"
import { useApi } from "@/lib/use-api"
import { hrefMarket } from "@/lib/route"
import { sessionState, wibNow } from "@/lib/session"
import type { Bandar, Broker, Foreign, Fundamentals, History, Quote } from "@/lib/api"
import { Badge, StatusDot } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CandlestickChart, type Candle } from "@/components/ui/chart"
import { Delta, ErrorNote, Figure, Panel, PanelHead, Segmented, useNow } from "@/components/market-bits"
import { tidyName } from "@/components/stock-search"

const PERIODS = [
  { key: "1mo", label: "1B", interval: "1d", title: "1 bulan" },
  { key: "3mo", label: "3B", interval: "1d", title: "3 bulan" },
  { key: "6mo", label: "6B", interval: "1d", title: "6 bulan" },
  { key: "1y", label: "1T", interval: "1d", title: "1 tahun" },
  { key: "5y", label: "5T", interval: "1wk", title: "5 tahun" },
] as const

export function StockPage({ symbol }: { symbol: string }) {
  const now = useNow()
  const { dow, mins } = wibNow(now)
  const pollable = dow > 0 && dow < 6 && mins >= 8 * 60 + 40 && mins <= 16 * 60 + 20
  const quote = useApi<Quote[]>(`quote?symbol=${encodeURIComponent(symbol)}`, { poll: pollable })
  const q = quote.data?.data[0]
  const fund = useApi<Fundamentals>(`fundamental?symbol=${encodeURIComponent(symbol)}`)
  const name = q?.name ?? fund.data?.data.name ?? null
  const sector = fund.data?.data.sector

  if (quote.error && !q && (quote.error as { code?: string }).code === "not_found") {
    return (
      <Panel className="grid justify-items-start gap-4 py-10">
        <h1 className="text-[28px] font-bold tracking-[-0.03em]">{symbol} tidak ditemukan</h1>
        <p className="text-muted-foreground">Kode saham di Bursa Efek Indonesia terdiri dari empat huruf, misalnya BBCA atau TLKM.</p>
        <a href={hrefMarket} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <ArrowLeftIcon className="size-4" /> Kembali ke papan pasar
        </a>
      </Panel>
    )
  }

  const st = sessionState(now)
  return (
    <div className="grid gap-4">
      <a href={hrefMarket} className="inline-flex w-fit items-center gap-1.5 rounded-full px-1 text-[13px] font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeftIcon className="size-4" /> Papan pasar
      </a>

      <Panel aria-labelledby="st-h" className="grid gap-6 p-5 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="grid gap-1.5">
            <h1 id="st-h" className="text-[clamp(34px,5vw,44px)] font-bold leading-none tracking-[-0.035em]">
              {symbol}
            </h1>
            <p className="text-[15px] text-muted-foreground">
              {name ? tidyName(name) : <Skeleton className="inline-block h-4 w-48 align-middle" />}
              {sector && <span> · {sector}</span>}
            </p>
          </div>
          <div className="grid justify-items-start gap-1 sm:justify-items-end">
            {q ? (
              <>
                <p className="text-[clamp(34px,5vw,44px)] font-bold leading-none tracking-[-0.035em]">{f.price(q.price)}</p>
                <Delta change={q.change} pct={q.change_pct} className="text-[16px]" />
              </>
            ) : (
              <Skeleton className="h-16 w-44" />
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Badge variant={st.tone === "live" ? "soft" : "secondary"} className="gap-1.5">
            <StatusDot tone={st.tone === "live" ? "brand" : "muted"} />
            {st.label}
          </Badge>
          {q?.market_time && <span>Harga {f.clock(q.market_time)} WIB, {f.dateShort(q.market_time)}</span>}
          {pollable && <span className="hidden sm:inline">· diperbarui otomatis tiap menit</span>}
        </div>

        {quote.error && !q && <ErrorNote what="Harga" error={quote.error} onRetry={quote.reload} />}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/70 pt-5 sm:grid-cols-4 lg:grid-cols-8">
          <Figure label="Pembukaan" value={f.price(q?.open)} />
          <Figure label="Sebelumnya" value={f.price(q?.previous_close)} />
          <Figure label="Rentang hari ini" value={q ? `${f.price(q.day_low)}–${f.price(q.day_high)}` : "–"} />
          <Figure label="Rentang 52 minggu" value={q ? `${f.price(q.week52_low)}–${f.price(q.week52_high)}` : "–"} />
          <Figure label="Volume" value={f.compact(q?.volume)} />
          <Figure label="Rata-rata 3 bulan" value={f.compact(q?.avg_volume_3m)} />
          <Figure label="Kap. pasar" value={f.rupiah(q?.market_cap)} />
          <Figure label="PER · PBV" value={q ? `${f.ratio(q.pe_trailing)} · ${f.ratio(q.price_to_book)}` : "–"} />
        </dl>
      </Panel>

      <Tabs defaultValue="harga" className="grid gap-4">
        <TabsList variant="line" className="w-full justify-start gap-6 overflow-x-auto px-1">
          <TabsTrigger value="harga" className="rounded-t-md">Grafik harga</TabsTrigger>
          <TabsTrigger value="fundamental" className="rounded-t-md">Fundamental</TabsTrigger>
          <TabsTrigger value="bandar" className="rounded-t-md">Bandar &amp; asing</TabsTrigger>
        </TabsList>
        <TabsContent value="harga">
          <PriceChart symbol={symbol} />
        </TabsContent>
        <TabsContent value="fundamental">
          <FundamentalView fund={fund} />
        </TabsContent>
        <TabsContent value="bandar">
          <BandarView symbol={symbol} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---- Price ----------------------------------------------------------- */

function PriceChart({ symbol }: { symbol: string }) {
  const [period, setPeriod] = React.useState<(typeof PERIODS)[number]>(PERIODS[1])
  const hist = useApi<History>(`history?symbol=${encodeURIComponent(symbol)}&period=${period.key}&interval=${period.interval}`)
  const h = hist.data?.data
  const candles: Candle[] = React.useMemo(
    () =>
      (h?.candles ?? [])
        .filter((c) => c.open != null && c.close != null)
        .map((c) => ({ time: c.time.slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? undefined })),
    [h]
  )
  return (
    <Panel aria-labelledby="px-h" className="grid gap-4">
      <PanelHead
        id="px-h"
        title={`Harga ${period.title}`}
        sub={h?.summary ? <Delta change={h.summary.change} pct={h.summary.change_pct} className="text-[13px]" /> : "Candle harian; minggu untuk 5 tahun"}
        action={
          <Segmented
            label="Periode grafik"
            options={PERIODS}
            value={period.key}
            onChange={(k) => setPeriod(PERIODS.find((p) => p.key === k)!)}
          />
        }
      />
      {hist.error ? (
        <ErrorNote what="Grafik harga" error={hist.error} onRetry={hist.reload} />
      ) : candles.length ? (
        <CandlestickChart
          data={candles}
          label={`${symbol} / IDR, ${period.title}`}
          height={380}
          priceFormatter={(v) => f.price(v)}
          volumeFormatter={(v) => f.compact(v)}
          movingAveragePeriod={candles.length >= 40 ? 20 : undefined}
        />
      ) : (
        <Skeleton className="h-[380px] w-full" />
      )}
    </Panel>
  )
}

/* ---- Fundamentals ---------------------------------------------------- */

const VERDICT: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "outline" }> = {
  undervalued: { label: "Tergolong murah", variant: "success" },
  fair: { label: "Wajar", variant: "secondary" },
  overvalued: { label: "Tergolong mahal", variant: "warning" },
  insufficient_data: { label: "Data belum cukup", variant: "outline" },
}
const RECO: Record<string, string> = {
  strong_buy: "Beli kuat",
  buy: "Beli",
  outperform: "Beli",
  hold: "Tahan",
  underperform: "Jual",
  sell: "Jual",
  strong_sell: "Jual kuat",
}

function Group({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="grid content-start gap-2">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <dl className="grid">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2 text-[14px] last:border-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function FundamentalView({ fund }: { fund: ReturnType<typeof useApi<Fundamentals>> }) {
  const d = fund.data?.data
  if (fund.error && !d) return <ErrorNote what="Fundamental" error={fund.error} onRetry={fund.reload} />
  if (!d) return <Skeleton className="h-80 w-full rounded-[22px]" />
  const v = d.valuation, p = d.profitability, g = d.growth, hl = d.health
  const verdict = d.verdict ? (VERDICT[d.verdict.label] ?? VERDICT.insufficient_data) : null
  const a = d.analyst
  const upside = a?.target_mean != null && d.price ? ((a.target_mean - d.price) / d.price) * 100 : null
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel aria-labelledby="fu-h" className="grid gap-5">
        <PanelHead id="fu-h" title="Valuasi dan kinerja" sub={d.most_recent_quarter ? `Laporan terakhir kuartal yang berakhir ${f.dateShort(d.most_recent_quarter)}` : undefined} />
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <Group
            title="Valuasi"
            rows={[
              ["PER (trailing)", f.ratio(v.pe_trailing)],
              ["PER (forward)", f.ratio(v.pe_forward)],
              ["PBV", f.ratio(v.price_to_book)],
              ["PEG", f.ratio(v.peg, "")],
              ["P/S", f.ratio(v.price_to_sales)],
            ]}
          />
          <Group
            title="Profitabilitas"
            rows={[
              ["ROE", f.pctPlain(p.roe_pct)],
              ["ROA", f.pctPlain(p.roa_pct)],
              ["Margin operasi", f.pctPlain(p.operating_margin_pct)],
              ["Margin bersih", f.pctPlain(p.net_margin_pct)],
            ]}
          />
          <Group
            title="Pertumbuhan dan dividen"
            rows={[
              ["Pendapatan (yoy)", f.pctPlain(g.revenue_growth_pct)],
              ["Laba (yoy)", f.pctPlain(g.earnings_growth_pct)],
              ["Imbal hasil dividen", f.pctPlain(d.dividend.yield_pct)],
              ["Rasio pembayaran", f.pctPlain(d.dividend.payout_ratio_pct)],
              ["Tanggal ex-dividen", d.dividend.ex_dividend_date ? f.dateShort(d.dividend.ex_dividend_date) : "–"],
            ]}
          />
          <Group
            title="Kesehatan"
            rows={[
              ["Utang / ekuitas", f.ratio(hl.debt_to_equity, "")],
              ["Rasio lancar", f.ratio(hl.current_ratio, "")],
              ["Total utang", f.rupiah(hl.total_debt)],
              ["Kas", f.rupiah(hl.total_cash)],
            ]}
          />
        </div>
      </Panel>

      <div className="grid content-start gap-4">
        {verdict && d.verdict && (
          <Panel aria-labelledby="vd-h" className="grid gap-3">
            <PanelHead id="vd-h" title="Kesimpulan mesin idx" sub={`Skor ${d.verdict.score > 0 ? "+" : ""}${d.verdict.score} dari aturan sederhana`} />
            <Badge variant={verdict.variant} className="w-fit text-[13px]">
              {verdict.label}
            </Badge>
            {d.verdict.reasons.length > 0 && (
              <ul lang="en" className="grid list-disc gap-1.5 pl-5 text-[13px] text-muted-foreground">
                {d.verdict.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {a && a.analysts ? (
          <Panel aria-labelledby="an-h" className="grid gap-3">
            <PanelHead id="an-h" title="Konsensus analis" sub={`${a.analysts} analis`} />
            <dl className="grid grid-cols-2 gap-4">
              <Figure label="Rekomendasi" value={a.recommendation ? (RECO[a.recommendation] ?? a.recommendation) : "–"} />
              <Figure
                label="Target rata-rata"
                value={
                  <span>
                    {f.price(a.target_mean)}{" "}
                    {upside != null && <span className={cn("text-[13px]", f.dir(upside) > 0 ? "text-up" : f.dir(upside) < 0 ? "text-down" : "text-muted-foreground")}>({f.pct(upside)})</span>}
                  </span>
                }
              />
              <Figure label="Target terendah" value={f.price(a.target_low)} />
              <Figure label="Target tertinggi" value={f.price(a.target_high)} />
            </dl>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

/* ---- Bandar & foreign --------------------------------------------------- */

const SIGNAL: Record<string, { label: string; tone: "up" | "down" | "flat" }> = {
  big_accumulation: { label: "Akumulasi besar", tone: "up" },
  accumulation: { label: "Akumulasi", tone: "up" },
  neutral: { label: "Netral", tone: "flat" },
  distribution: { label: "Distribusi", tone: "down" },
  big_distribution: { label: "Distribusi besar", tone: "down" },
}
const PHASE: Record<string, string> = {
  quiet_accumulation: "akumulasi diam-diam (harga belum naik)",
  markup: "markup: dikumpulkan sambil harga naik",
  quiet_distribution: "distribusi diam-diam (harga belum turun)",
  markdown: "markdown: dilepas sambil harga turun",
  neutral: "tanpa arah jelas",
}
const BANDAR_PERIODS = [
  { key: "1d", label: "1H", title: "1 hari" },
  { key: "1w", label: "1M", title: "1 minggu" },
  { key: "1m", label: "1B", title: "1 bulan" },
] as const

function BrokerTable({ rows, side }: { rows: Broker[]; side: "beli" | "jual" }) {
  return (
    <Table className="text-[13.5px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{side === "beli" ? "Pembeli" : "Penjual"}</TableHead>
          <TableHead className="text-right">Nilai</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Lot</TableHead>
          <TableHead className="text-right">Rata-rata</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 5).map((b) => (
          <TableRow key={b.code}>
            <TableCell className="py-2">
              <span className="font-semibold">{b.code}</span>
              {b.kind === "foreign" && <span className="ml-1.5 text-[12px] text-muted-foreground">asing</span>}
            </TableCell>
            <TableCell className="text-right font-semibold">{f.rupiah(b.value)}</TableCell>
            <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{f.compact(b.lots)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{f.price(b.average_price)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Net foreign buying per session as bars around a labelled zero line, with
 * the scale in rupiah. One bar is "read" at a time (the latest by default);
 * pointer, focus and the arrow keys move it.
 */
function ForeignBars({ days }: { days: Foreign["days"] }) {
  const [active, setActive] = React.useState(days.length - 1)
  const vals = days.map((d) => d.foreign_net_value ?? 0)
  const max = Math.max(1, ...vals.map(Math.abs))
  const cur = days[Math.min(active, days.length - 1)]
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((i) => Math.min(days.length - 1, i + 1))
    else if (e.key === "ArrowLeft") setActive((i) => Math.max(0, i - 1))
    else if (e.key === "Home") setActive(0)
    else if (e.key === "End") setActive(days.length - 1)
    else return
    e.preventDefault()
  }
  if (!days.length) return null
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3" aria-live="polite">
        <span className="text-[13px] text-muted-foreground">{f.dateLong(cur.date)}</span>
        <span className={cn("text-[15px] font-semibold", f.dir(cur.foreign_net_value) > 0 ? "text-up" : f.dir(cur.foreign_net_value) < 0 ? "text-down" : "")}>
          {f.rupiahSigned(cur.foreign_net_value)}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
        <div
          role="group"
          tabIndex={0}
          aria-label="Net asing per sesi. Panah kiri dan kanan memilih sesi."
          onKeyDown={onKey}
          className="relative flex h-36 items-stretch gap-1.5 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-border/70" aria-hidden />
          <span className="absolute inset-x-0 top-1/2 h-px bg-muted-foreground/50" aria-hidden />
          <span className="absolute inset-x-0 bottom-0 h-px bg-border/70" aria-hidden />
          {days.map((d, i) => {
            const v = d.foreign_net_value ?? 0
            const h = (Math.abs(v) / max) * 50
            return (
              <div key={d.date} className="relative flex-1 cursor-default" onPointerEnter={() => setActive(i)} aria-hidden>
                <span
                  className={cn(
                    "absolute inset-x-0 mx-auto max-w-6 transition-opacity",
                    v >= 0 ? "rounded-t-[4px] bg-[var(--chart-up)]" : "rounded-b-[4px] bg-[var(--chart-down)]",
                    i === active ? "opacity-100" : "opacity-55"
                  )}
                  style={v >= 0 ? { bottom: "50%", height: `${h}%` } : { top: "50%", height: `${h}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="relative w-14 text-[11px] tabular-nums text-muted-foreground" aria-hidden>
          <span className="absolute left-0 top-0 -translate-y-1/2">+{f.compact(max)}</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2">0</span>
          <span className="absolute bottom-0 left-0 translate-y-1/2">−{f.compact(max)}</span>
        </div>
      </div>
      <div className="flex justify-between pr-16 text-[11px] tabular-nums text-muted-foreground">
        <span>{f.dateShort(days[0].date)}</span>
        <span>{f.dateShort(days[days.length - 1].date)}</span>
      </div>
      <table className="sr-only">
        <caption>Net beli asing per sesi, rupiah</caption>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Net asing</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{f.dateLong(d.date)}</td>
              <td>{f.rupiahSigned(d.foreign_net_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BandarView({ symbol }: { symbol: string }) {
  const [period, setPeriod] = React.useState<(typeof BANDAR_PERIODS)[number]>(BANDAR_PERIODS[1])
  const bandar = useApi<Bandar[]>(`bandar?symbol=${encodeURIComponent(symbol)}&period=${period.key}&top=5`)
  const foreign = useApi<Foreign>(`foreign?symbol=${encodeURIComponent(symbol)}&days=10`)
  const b = bandar.data?.data[0]
  const fo = foreign.data?.data
  const sig = b ? (SIGNAL[b.signal] ?? SIGNAL.neutral) : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel aria-labelledby="bd-h" className="grid content-start gap-5">
        <PanelHead
          id="bd-h"
          title="Ringkasan broker"
          sub={b ? `${f.dateShort(b.from)}–${f.dateShort(b.to)} · 5 broker teratas tiap sisi, semua investor` : "Broker summary dari IPOT"}
          action={
            <Segmented
              label="Rentang ringkasan broker"
              options={BANDAR_PERIODS}
              value={period.key}
              onChange={(k) => setPeriod(BANDAR_PERIODS.find((p) => p.key === k)!)}
            />
          }
        />
        {bandar.error && !b ? (
          <ErrorNote what="Ringkasan broker" error={bandar.error} onRetry={bandar.reload} />
        ) : !b || !sig ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <p className="flex items-center gap-2.5 text-[26px] font-bold tracking-[-0.03em]">
                <StatusDot tone={sig.tone === "up" ? "brand" : sig.tone === "down" ? "destructive" : "muted"} className="size-2.5" />
                {sig.label}
              </p>
              <p className="text-[14px] text-muted-foreground">
                Lima pembeli teratas {b.net_value != null && b.net_value >= 0 ? "membeli lebih banyak" : "menjual lebih banyak"} dari lima penjual teratas: net{" "}
                <b className="font-semibold text-foreground">{f.rupiahSigned(b.net_value)}</b>, {f.pctPlain(b.net_pct)} dari{" "}
                {f.rupiah(b.total_value)} yang ditransaksikan. Fase: {PHASE[b.phase] ?? b.phase}.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-y border-border/70 py-4 sm:grid-cols-4">
              <Figure label="Rata-rata bandar" value={f.price(b.bandar_average)} />
              <Figure label="Posisi vs harga" value={<span className={cn(f.dir(b.bandar_gain_pct) > 0 ? "text-up" : f.dir(b.bandar_gain_pct) < 0 ? "text-down" : "")}>{f.pct(b.bandar_gain_pct)}</span>} />
              <Figure label="Net asing" value={<span className={cn(f.dir(b.foreign_net_value) > 0 ? "text-up" : f.dir(b.foreign_net_value) < 0 ? "text-down" : "")}>{f.rupiahSigned(b.foreign_net_value)}</span>} />
              <Figure label="Porsi net asing" value={<span className={cn(f.dir(b.foreign_net_pct) > 0 ? "text-up" : f.dir(b.foreign_net_pct) < 0 ? "text-down" : "")}>{f.pct(b.foreign_net_pct)}</span>} />
            </dl>
            <div className="grid gap-6 md:grid-cols-2">
              <BrokerTable rows={b.buyers} side="beli" />
              <BrokerTable rows={b.sellers} side="jual" />
            </div>
          </>
        )}
      </Panel>

      <Panel aria-labelledby="fo-h" className="grid content-start gap-4">
        <PanelHead id="fo-h" title="Arus dana asing" sub="Net beli asing per sesi, 10 sesi terakhir" />
        {foreign.error && !fo ? (
          <ErrorNote what="Arus asing" error={foreign.error} onRetry={foreign.reload} />
        ) : !fo ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4">
              <Figure label={`Total ${fo.totals.sessions} sesi`} value={<span className={cn(f.dir(fo.totals.foreign_net_value) > 0 ? "text-up" : f.dir(fo.totals.foreign_net_value) < 0 ? "text-down" : "")}>{f.rupiahSigned(fo.totals.foreign_net_value)}</span>} />
              <Figure label="Net beli / net jual" value={`${fo.totals.net_buy_sessions} / ${fo.totals.net_sell_sessions} sesi`} />
            </dl>
            <ForeignBars days={fo.days} />
            <p className="text-[12.5px] text-muted-foreground">Sesi hari ini masuk setelah bursa tutup. Sumber: IPOT, semua papan.</p>
          </>
        )}
      </Panel>
    </div>
  )
}
