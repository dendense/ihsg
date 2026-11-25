import * as React from "react"

// Hash routes, so GitHub Pages needs no rewrite rules:
//   #/               market board
//   #/saham/BBCA     one stock

export type Route = { name: "market" } | { name: "stock"; symbol: string }

export function parse(hash: string): Route {
  const m = hash.replace(/^#/, "").match(/^\/saham\/([A-Za-z0-9.^-]{2,12})\/?$/)
  return m ? { name: "stock", symbol: m[1].toUpperCase() } : { name: "market" }
}

export const hrefStock = (symbol: string) => `#/saham/${symbol.toUpperCase()}`
export const hrefMarket = "#/"

export function useRoute(): Route {
  const [route, setRoute] = React.useState(() => parse(window.location.hash))
  React.useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return route
}

export const go = (href: string) => {
  window.location.hash = href.replace(/^#/, "")
}
