import * as React from "react"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { api, type Instrument, type Instruments } from "@/lib/api"
import { go, hrefStock } from "@/lib/route"
import { Kbd } from "@/components/ui/kbd"

// One read of the 955-code universe per visit, shared by every search box.
let universe: Promise<Instrument[]> | null = null
function loadUniverse() {
  universe ??= api<Instruments>("instruments")
    .then((e) => e.data.instruments.map(({ symbol, name }) => ({ symbol, name })))
    .catch((e) => {
      universe = null
      throw e
    })
  return universe
}

const tidy = (name: string) =>
  name
    .replace(/^PT\.?\s+/i, "")
    .replace(/\s+Tbk\.?$/i, "")
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())

function rank(list: Instrument[], q: string) {
  const s = q.trim().toUpperCase()
  if (!s) return []
  const code: Instrument[] = []
  const starts: Instrument[] = []
  const name: Instrument[] = []
  for (const it of list) {
    if (it.symbol === s || it.symbol.startsWith(s)) code.push(it)
    else if (it.name.toUpperCase().startsWith(s)) starts.push(it)
    else if (s.length > 1 && it.name.toUpperCase().includes(s)) name.push(it)
  }
  return [...code, ...starts, ...name].slice(0, 8)
}

export function StockSearch({ className, autoFocusKey = true }: { className?: string; autoFocusKey?: boolean }) {
  const id = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [list, setList] = React.useState<Instrument[]>([])
  const [failed, setFailed] = React.useState(false)
  const [q, setQ] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)

  const ensure = React.useCallback(() => {
    if (list.length) return
    loadUniverse()
      .then((l) => {
        setList(l)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [list.length])

  // "/" jumps to the search box, as on most market sites.
  React.useEffect(() => {
    if (!autoFocusKey) return
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, [contenteditable]")) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [autoFocusKey])

  const hits = React.useMemo(() => rank(list, q), [list, q])
  const typed = q.trim().toUpperCase()
  const exact = /^[A-Z]{4}$/.test(typed)

  const choose = (symbol: string) => {
    setQ("")
    setOpen(false)
    inputRef.current?.blur()
    go(hrefStock(symbol))
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const pick = hits[active]?.symbol ?? (exact ? typed : null)
      if (pick) choose(pick)
    } else if (e.key === "Escape") {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showList = open && typed.length > 0
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={`${id}-q`} className="sr-only">
        Cari saham
      </label>
      <SearchIcon aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        id={`${id}-q`}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && hits[active] ? `${id}-${hits[active].symbol}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Cari kode atau nama, mis. BBCA"
        value={q}
        onFocus={() => {
          ensure()
          setOpen(true)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKey}
        className="h-10 w-full rounded-full border border-input bg-card pl-10 pr-12 text-sm shadow-[inset_0_1px_2px_rgb(15_23_22/0.04)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
      />
      <Kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Saran saham"
          className="absolute inset-x-0 top-12 z-50 max-h-[22rem] overflow-auto rounded-[18px] bg-popover p-1 text-popover-foreground shadow-raised ring-1 ring-border/60"
        >
          {hits.map((h, i) => (
            <li
              key={h.symbol}
              id={`${id}-${h.symbol}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(h.symbol)
              }}
              onMouseEnter={() => setActive(i)}
              className="flex cursor-pointer items-baseline gap-3 rounded-[14px] px-3 py-2 text-sm aria-selected:bg-accent"
            >
              <span className="w-12 shrink-0 font-semibold">{h.symbol}</span>
              <span className="truncate text-muted-foreground">{tidy(h.name)}</span>
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">
              {failed
                ? "Daftar saham belum termuat. Ketik kode empat huruf lalu Enter."
                : list.length === 0
                  ? "Memuat daftar saham…"
                  : exact
                    ? `Tidak ada di daftar. Tekan Enter untuk membuka ${typed}.`
                    : "Tidak ada saham yang cocok."}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export { tidy as tidyName }
