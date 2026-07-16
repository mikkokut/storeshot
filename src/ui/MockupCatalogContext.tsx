import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { request } from "@/api"
import {
  emptyDeviceMockupCatalog,
  mergeDeviceMockupCatalogs,
  parseMockupBundleManifest,
  resolveMockupBundle,
  type DeviceMockupCatalog,
} from "../device-mockups"

const BUILT_IN_BUNDLE_URL = "/mockup-bundles/frameup-free/storeshot-mockups.json"

interface MockupCatalogContextValue {
  catalog: DeviceMockupCatalog
  error: string | null
  loading: boolean
  refresh: () => Promise<DeviceMockupCatalog>
}

const MockupCatalogContext = createContext<MockupCatalogContextValue | null>(null)

export function MockupCatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<DeviceMockupCatalog>(emptyDeviceMockupCatalog)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [builtInResult, projectResult] = await Promise.allSettled([
        fetch(BUILT_IN_BUNDLE_URL, { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("Could not load the built-in mockup bundle")
          const manifest = parseMockupBundleManifest(await response.json())
          return resolveMockupBundle(manifest, "/mockup-bundles/frameup-free/", "built-in")
        }),
        request<DeviceMockupCatalog>("/api/mockup-bundles"),
      ])
      const catalogs = [builtInResult, projectResult].flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      const failures = [builtInResult, projectResult].flatMap((result) => result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : "Could not load device mockups"]
        : [])
      if (catalogs.length === 0) throw new Error(failures.join(" "))
      const nextCatalog = mergeDeviceMockupCatalogs(...catalogs)
      setCatalog(nextCatalog)
      setError(failures.length > 0 ? failures.join(" ") : null)
      return nextCatalog
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Could not load device mockups"
      setError(message)
      throw nextError
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
    const handleChange = () => void refresh().catch(() => undefined)
    window.addEventListener("storeshot:mockups-changed", handleChange)
    return () => window.removeEventListener("storeshot:mockups-changed", handleChange)
  }, [refresh])

  const value = useMemo(() => ({ catalog, error, loading, refresh }), [catalog, error, loading, refresh])
  return <MockupCatalogContext.Provider value={value}>{children}</MockupCatalogContext.Provider>
}

export function useMockupCatalog(): MockupCatalogContextValue {
  const value = useContext(MockupCatalogContext)
  if (!value) throw new Error("useMockupCatalog must be used inside MockupCatalogProvider")
  return value
}
