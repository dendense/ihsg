import * as React from "react"
import { api, type Envelope } from "./api"

export type ApiState<T> = {
  data: Envelope<T> | null
  error: Error | null
  loading: boolean
  /** when the last successful answer arrived (ms) */
  updatedAt: number | null
  reload: () => void
}

/**
 * GET /api/<path>, re-read every `pollMs` while `poll` is true and the tab is
 * visible. A failed refresh keeps the last good answer and reports the error.
 */
export function useApi<T>(path: string | null, { poll = false, pollMs = 60_000 }: { poll?: boolean; pollMs?: number } = {}): ApiState<T> {
  const [data, setData] = React.useState<Envelope<T> | null>(null)
  const [error, setError] = React.useState<Error | null>(null)
  const [loading, setLoading] = React.useState(Boolean(path))
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null)
  const [tick, setTick] = React.useState(0)
  const reload = React.useCallback(() => setTick((t) => t + 1), [])

  // A new path starts clean, so a stock page never shows the previous stock.
  React.useEffect(() => {
    setData(null)
    setError(null)
    setUpdatedAt(null)
  }, [path])

  React.useEffect(() => {
    if (!path) return
    const ctrl = new AbortController()
    setLoading(true)
    api<T>(path, ctrl.signal)
      .then((env) => {
        setData(env)
        setError(null)
        setUpdatedAt(Date.now())
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [path, tick])

  React.useEffect(() => {
    if (!path || !poll) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload()
    }, pollMs)
    const onVisible = () => document.visibilityState === "visible" && reload()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [path, poll, pollMs, reload])

  return { data, error, loading, updatedAt, reload }
}
