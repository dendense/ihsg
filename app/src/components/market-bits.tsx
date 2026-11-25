import * as React from "react"
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, RotateCwIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import * as f from "@/lib/format"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { ApiError } from "@/lib/api"

/** Price change with direction carried by an arrow as well as colour. */
export function Delta({ change, pct, decimals = 0, className, showAbs = true }: { change?: number | null; pct: number | null; decimals?: number; className?: string; showAbs?: boolean }) {
  const d = f.dir(pct ?? change)
  const Icon = d > 0 ? ArrowUpRightIcon : d < 0 ? ArrowDownRightIcon : MinusIcon
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", d > 0 ? "text-up" : d < 0 ? "text-down" : "text-muted-foreground", className)}>
      <Icon aria-hidden className="size-[1em] shrink-0" strokeWidth={2.4} />
      {showAbs && change != null && <span>{f.change(change, decimals)}</span>}
      <span>{showAbs && change != null ? `(${f.pct(pct)})` : f.pct(pct)}</span>
    </span>
  )
}

/** Advancing / unchanged / declining as one 10px bar with 2px gaps. */
export function BreadthBar({ up, flat, down, className }: { up: number; flat: number; down: number; className?: string }) {
  const parts = [
    { n: up, cls: "bg-[var(--chart-up)]", label: "naik" },
    { n: flat, cls: "bg-input", label: "tetap" },
    { n: down, cls: "bg-[var(--chart-down)]", label: "turun" },
  ]
  return (
    <div className={cn("grid gap-2", className)}>
      <div
        role="img"
        aria-label={`${up} saham naik, ${flat} tetap, ${down} turun`}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {parts.map((p) => p.n > 0 && <span key={p.label} className={cn("h-full first:rounded-l-full last:rounded-r-full", p.cls)} style={{ flex: `${p.n} 1 0` }} />)}
      </div>
      <div className="flex justify-between text-[13px] text-muted-foreground">
        <span>
          <b className="font-semibold text-foreground">{up}</b> naik
        </span>
        <span>
          <b className="font-semibold text-foreground">{flat}</b> tetap
        </span>
        <span>
          <b className="font-semibold text-foreground">{down}</b> turun
        </span>
      </div>
    </div>
  )
}

/** One labelled figure in a row of figures (not a card). */
export function Figure({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-0.5", className)}>
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] font-semibold tracking-[-0.01em]">{value}</dd>
    </div>
  )
}

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-[22px] bg-card p-5 text-card-foreground shadow-panel ring-1 ring-border/60", className)} {...props} />
}

export function PanelHead({ title, sub, action, id }: { title: string; sub?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="grid gap-0.5">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {sub && <p className="text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

const ERROR_COPY: Record<string, string> = {
  network: "Server data tidak terjangkau. Periksa koneksi, atau Worker belum di-deploy.",
  provider: "Sumber data sedang tidak menjawab.",
  blocked: "Sumber data menolak permintaan untuk sementara.",
  not_found: "Data tidak ditemukan.",
  usage: "Permintaan tidak valid.",
}

export function ErrorNote({ error, onRetry, what, className }: { error: Error; onRetry?: () => void; what: string; className?: string }) {
  const code = (error as ApiError).code
  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{what} belum bisa dimuat</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {ERROR_COPY[code] ?? "Terjadi kesalahan."} <span className="opacity-80">({error.message})</span>
        </span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCwIcon /> Coba lagi
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * The Dens-UI pill segmented control (40px Muted Fill track, 4px inset, white
 * active pill), as a radio group: it picks a range, it does not switch panels.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { key: T; label: string; title: string }[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + options.length) % options.length
    onChange(options[n].key)
    refs.current[n]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-10 w-fit items-center gap-0.5 rounded-full bg-muted p-1 ring-1 ring-inset ring-border/60", className)}>
      {options.map((o, i) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.title}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => onKey(e, i)}
            className="h-full rounded-full px-3.5 text-sm font-semibold tabular-nums text-muted-foreground outline-none transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-[0_1px_2px_rgb(15_23_22/0.08),0_2px_8px_-2px_rgb(15_23_22/0.1)]"
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function useNow(everyMs = 30_000) {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}
