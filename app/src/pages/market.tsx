import * as React from "react"

import { cn } from "@/lib/utils"
import * as f from "@/lib/format"
import { useApi } from "@/lib/use-api"
import { hrefStock } from "@/lib/route"
import { sessionState, wibNow } from "@/lib/session"
import type { Market, Mover, Quote } from "@/lib/api"
import { Badge, StatusDot } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SessionChart, type MinuteBar } from "@/components/session-chart"
import { BreadthBar, Delta, ErrorNote, Figure, Panel, PanelHead, useNow } from "@/components/market-bits"
import { tidyName } from "@/components/stock-search"

type Intraday = {
  session: string
  quote: Quote & { previous_close: number | null }
  bars: { time: string; close: number | null }[]
  summary: { high: number | null; low: number | null; open: number | null } | null
}

const minsOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))
const todayWib = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
const dowOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay()

export function MarketPage() {
  const now = useNow()
  const { dow, mins } = wibNow(now)
  const weekday = dow > 0 && dow < 6
  // Poll only while the exchange can move: 08.40 to 16.20 WIB on weekdays.
  const pollable = weekday && mins >= 8 * 60 + 40 && mins <= 16 * 60 + 20
  const market = useApi<Market>("market", { poll: pollable })
  const intraday = useApi<Intraday>("intraday?symbol=%5EJKSE&interval=1m", { poll: pollable })

  return (
    <div className="grid gap-4">
      <h1 className="sr-only">Pasar saham Indonesia hari ini</h1>
      <IndexPanel market={market} intraday={intraday} now={now} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Heavyweights market={market} />
        <Movers market={market} />
      </div>
    </div>
  )
}

/* ---- IHSG ------------------------------------------------------------ */

function IndexPanel({ market, intraday, now }: { market: ReturnType<typeof useApi<Market>>; intraday: ReturnType<typeof useApi<Intraday>>; now: Date }) {
  const m = market.data?.data
  const d = intraday.data?.data
  const ix = m?.index
  const q = d?.quote
  // Intraday is the finer read; the board snapshot stands in when it is missing.
  const price = q?.price ?? ix?.price ?? null
  const change = q?.change ?? ix?.change ?? null
  const pct = q?.change_pct ?? ix?.change_pct ?? null
  const prevClose = q?.previous_close ?? (price != null && change != null ? price - change : null)

  const session = d?.session ?? null
  const live = session === todayWib()
  const { dow, mins } = wibNow(now)
  const holiday = dow > 0 && dow < 6 && mins >= 9 * 60 + 5 && session != null && !live
  const st = sessionState(now, holiday)
  const bars: MinuteBar[] = React.useMemo(
    () => (d?.bars ?? []).filter((b) => b.close != null).map((b) => ({ mins: minsOf(b.time), close: b.close as number })),
    [d]
  )
  const high = d?.summary?.high ?? q?.day_high ?? null
  const low = d?.summary?.low ?? q?.day_low ?? null
  const stale = market.data?.stale
  const asOf = m?.as_of ?? q?.market_time ?? null

  return (
    <Panel aria-labelledby="ihsg-h" className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
      <div className="grid content-start gap-5">
        <div className="grid gap-1">
          <h2 id="ihsg-h" className="text-[15px] font-semibold text-muted-foreground">
            IHSG <span className="font-normal">· Indeks Harga Saham Gabungan</span>
          </h2>
          {price == null ? (
            <Skeleton className="mt-2 h-16 w-60" />
          ) : (
            <p className="text-[clamp(44px,7vw,64px)] font-bold leading-none tracking-[-0.04em]">{f.price(price, 2)}</p>
          )}
          {price != null && <Delta change={change} pct={pct} decimals={2} className="mt-1.5 text-[17px]" />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={st.tone === "live" ? "soft" : "secondary"} className="gap-1.5">
            <StatusDot tone={st.tone === "live" ? "brand" : "muted"} />
            {st.label}
          </Badge>
          <span className="text-[13px] text-muted-foreground">
            {asOf ? `Data ${f.clock(asOf)} WIB${!live && session ? `, sesi ${f.dateShort(session)}` : ""}` : st.detail}
          </span>
        </div>

        {m ? (
          <BreadthBar up={m.advancing} flat={m.unchanged} down={m.declining} />
        ) : (
          <Skeleton className="h-10 w-full" />
        )}

        <dl className="grid grid-cols-3 gap-4 border-t border-border/70 pt-4">
          <Figure label="Nilai transaksi" value={m ? f.rupiah(m.turnover) : "–"} />
          <Figure label="Tertinggi" value={f.price(high, 2)} />
          <Figure label="Terendah" value={f.price(low, 2)} />
        </dl>

        {market.error && <ErrorNote what="Papan pasar" error={market.error} onRetry={market.reload} />}
        {stale && !market.error && (
          <p className="text-[13px] text-muted-foreground">Papan harga belum diperbarui sesuai jadwal; angka di atas dari pembacaan terakhir.</p>
        )}
      </div>

      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">IHSG per menit</h3>
          <p className="text-[13px] text-muted-foreground">
            {market.updatedAt ? (
              <>
                Diperbarui {f.clock(market.updatedAt)} WIB
                {live && <span className="hidden sm:inline"> · otomatis tiap menit</span>}
              </>
            ) : (
              "Memuat"
            )}
          </p>
        </div>
        {intraday.error && !d ? (
          <ErrorNote what="Grafik IHSG" error={intraday.error} onRetry={intraday.reload} />
        ) : !d ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <SessionChart bars={bars} prevClose={prevClose} session={session ?? todayWib()} dow={session ? dowOf(session) : dow} live={live} now={now} height={232} />
        )}
      </div>
    </Panel>
  )
}

/* ---- Heavyweights ------------------------------------------------------ */

function StockCell({ row }: { row: Mover }) {
  return (
    <a href={hrefStock(row.symbol)} className="group/s grid gap-0.5 outline-none after:absolute after:inset-0 focus-visible:after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-ring">
      <span className="font-semibold group-hover/s:underline">{row.symbol}</span>
      <span className="max-w-[16rem] truncate text-[12.5px] text-muted-foreground">{row.name ? tidyName(row.name) : ""}</span>
    </a>
  )
}

function Heavyweights({ market }: { market: ReturnType<typeof useApi<Market>> }) {
  const rows = market.data?.data.heavyweights
  return (
    <Panel aria-labelledby="hw-h" className="grid min-w-0 content-start gap-3">
      <PanelHead id="hw-h" title="Saham unggulan" sub="16 kapitalisasi pasar terbesar di bursa" />
      <Table className="text-[14px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Saham</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Harga</TableHead>
            <TableHead className="text-right">
              <span className="sm:hidden">Harga</span>
              <span className="hidden sm:inline">Perubahan</span>
            </TableHead>
            <TableHead className="hidden text-right sm:table-cell">Volume</TableHead>
            <TableHead className="hidden text-right md:table-cell">Nilai</TableHead>
            <TableHead className="hidden text-right xl:table-cell">Kap. pasar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows
            ? rows.map((r) => (
                <TableRow key={r.symbol} className="relative">
                  <TableCell className="py-2.5">
                    <StockCell row={r} />
                  </TableCell>
                  <TableCell className="hidden text-right font-semibold sm:table-cell">{f.price(r.price)}</TableCell>
                  <TableCell className="text-right">
                    {/* phones: price over its change, so the name keeps its room */}
                    <span className="grid justify-items-end gap-0.5">
                      <span className="font-semibold sm:hidden">{f.price(r.price)}</span>
                      <Delta change={r.change} pct={r.change_pct} className="justify-end text-[12.5px] sm:text-[13.5px]" />
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{f.compact(r.volume)}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground md:table-cell">{f.rupiah(r.value)}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground xl:table-cell">{f.rupiah(r.market_cap)}</TableCell>
                </TableRow>
              ))
            : Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-3">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </Panel>
  )
}

/* ---- Movers ----------------------------------------------------------- */

function MoverList({ rows, by }: { rows: Mover[]; by: "pct" | "value" }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada transaksi di sesi ini.</p>
  return (
    <ol className="grid">
      {rows.map((r, i) => (
        <li key={r.symbol} className="relative flex items-center gap-3 border-b border-border/70 py-2.5 last:border-0">
          <span className="w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
          <a
            href={hrefStock(r.symbol)}
            className="grid min-w-0 flex-1 gap-0.5 outline-none after:absolute after:inset-0 focus-visible:after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            <span className="text-[14px] font-semibold">{r.symbol}</span>
            <span className="truncate text-[12.5px] text-muted-foreground">{r.name ? tidyName(r.name) : ""}</span>
          </a>
          <span className="grid justify-items-end gap-0.5 text-[13.5px]">
            {by === "value" ? (
              <>
                <span className="font-semibold">{f.rupiah(r.value)}</span>
                <Delta pct={r.change_pct} showAbs={false} className="text-[12.5px]" />
              </>
            ) : (
              <>
                <Delta pct={r.change_pct} showAbs={false} />
                <span className="text-[12.5px] text-muted-foreground">{f.price(r.price)}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Movers({ market }: { market: ReturnType<typeof useApi<Market>> }) {
  const m = market.data?.data
  return (
    <Panel aria-labelledby="mv-h" className={cn("grid min-w-0 content-start gap-4")}>
      <PanelHead id="mv-h" title="Pergerakan saham" sub="Naik dan turun: kapitalisasi di atas Rp 1 T" />
      <Tabs defaultValue="naik" className="grid gap-2">
        <TabsList className="w-full">
          <TabsTrigger value="naik" className="flex-1">
            Naik
          </TabsTrigger>
          <TabsTrigger value="turun" className="flex-1">
            Turun
          </TabsTrigger>
          <TabsTrigger value="ramai" className="flex-1">
            Teramai
          </TabsTrigger>
        </TabsList>
        {m ? (
          <>
            <TabsContent value="naik">
              <MoverList rows={m.gainers.filter((r) => (r.change_pct ?? 0) > 0)} by="pct" />
            </TabsContent>
            <TabsContent value="turun">
              <MoverList rows={m.losers.filter((r) => (r.change_pct ?? 0) < 0)} by="pct" />
            </TabsContent>
            <TabsContent value="ramai">
              <MoverList rows={m.most_active} by="value" />
            </TabsContent>
          </>
        ) : (
          <div className="grid gap-3 pt-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
      </Tabs>
    </Panel>
  )
}
