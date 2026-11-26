import * as React from "react"
import { MoonIcon, SunIcon } from "lucide-react"

import { Navbar, NavbarBrand, NavbarLink, NavbarLinks, NavbarActions } from "@/components/ui/navbar"
import { StockSearch } from "@/components/stock-search"
import { MarketPage } from "@/pages/market"
import { StockPage } from "@/pages/stock"
import { hrefMarket, useRoute } from "@/lib/route"

function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("ihsg-theme", next ? "dark" : "light")
    } catch {
      /* private mode */
    }
    setDark(next)
  }
  return { dark, toggle }
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" aria-hidden className="size-6">
        <rect width="24" height="24" rx="7" fill="var(--brand)" />
        <path d="M5 15.5 9 11l3 3 7-7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        IHSG<span className="text-muted-foreground font-semibold"> hari ini</span>
      </span>
    </span>
  )
}

export function App() {
  const route = useRoute()
  const { dark, toggle } = useTheme()

  React.useEffect(() => {
    document.title = route.name === "stock" ? `${route.symbol} · IHSG Hari Ini` : "IHSG Hari Ini"
  }, [route])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col px-4 pb-10 sm:px-6">
      <a href="#utama" className="sr-only-focusable z-50 rounded-full bg-card px-4 py-2 text-sm font-semibold shadow-raised">
        Lompat ke isi
      </a>
      {/* the ground band behind the pill keeps scrolled content from showing above it */}
      <header className="sticky top-0 z-40 -mx-4 bg-background/90 px-4 pb-1 pt-3 backdrop-blur-md sm:-mx-6 sm:px-6 sm:pt-4">
        <Navbar className="gap-2 pl-4 sm:gap-4 sm:pl-5">
          <NavbarBrand href={hrefMarket} aria-label="IHSG hari ini, papan pasar">
            <Wordmark />
          </NavbarBrand>
          <NavbarLinks className="mx-0 ml-2">
            <NavbarLink href={hrefMarket} active={route.name === "market"}>
              Pasar
            </NavbarLink>
          </NavbarLinks>
          <NavbarActions className="ml-auto min-w-0 flex-1 justify-end md:ml-auto">
            <StockSearch className="w-full max-w-[22rem] min-w-0" />
            <button
              type="button"
              onClick={toggle}
              aria-label={dark ? "Pakai tema terang" : "Pakai tema gelap"}
              className="grid size-10 shrink-0 place-content-center rounded-full text-foreground/80 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </NavbarActions>
        </Navbar>
      </header>

      <main id="utama" tabIndex={-1} className="mt-3 flex-1 outline-none sm:mt-4">
        {route.name === "stock" ? <StockPage key={route.symbol} symbol={route.symbol} /> : <MarketPage />}
      </main>

      <footer className="mt-10 flex flex-col gap-2 border-t border-border/70 pt-5 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Data tertunda sesuai sumber: Yahoo Finance dan MSN. Bukan saran investasi.
        </p>
        <p>
          Mesin data dari{" "}
          <a className="font-semibold text-foreground underline-offset-4 hover:underline" href="https://github.com/fzn0x/idx">
            fzn0x/idx
          </a>{" "}
          (MIT) · grafik{" "}
          <a className="font-semibold text-foreground underline-offset-4 hover:underline" href="https://www.tradingview.com/lightweight-charts/">
            TradingView Lightweight Charts
          </a>{" "}
          · tampilan{" "}
          <a className="font-semibold text-foreground underline-offset-4 hover:underline" href="https://dendense.github.io/dens-ui">
            Dens-UI
          </a>
        </p>
      </footer>
    </div>
  )
}
