import { useEffect, useMemo, useState } from "react"
import { Check, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  deviceMockupById,
  type DevicePlatform,
} from "../device-mockups"
import { MockupBundleImporter } from "./MockupBundleImporter"
import { useMockupCatalog } from "./MockupCatalogContext"

interface DeviceMockupPickerProps {
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onValueChange: (mockupId: string) => void
}

const platformOptions: Array<{ id: "all" | DevicePlatform; label: string }> = [
  { id: "all", label: "All" },
  { id: "iphone", label: "iPhone" },
  { id: "ipad", label: "iPad" },
  { id: "mac", label: "Mac" },
  { id: "watch", label: "Watch" },
]

export function DeviceMockupPicker({ open, value, onOpenChange, onValueChange }: DeviceMockupPickerProps) {
  const { catalog, error: catalogError, loading } = useMockupCatalog()
  const selectedMockup = deviceMockupById(catalog, value) ?? catalog.mockups[0]
  const [platform, setPlatform] = useState<"all" | DevicePlatform>("all")
  const [groupId, setGroupId] = useState(selectedMockup?.groupId ?? "")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return
    setGroupId(selectedMockup?.groupId ?? catalog.groups[0]?.id ?? "")
    setPlatform(selectedMockup?.platform ?? "all")
    setQuery("")
  }, [catalog.groups, open, selectedMockup?.groupId, selectedMockup?.platform])

  const visibleGroups = useMemo(() => catalog.groups.filter((group) => (
    platform === "all" || group.platform === platform
  )), [catalog.groups, platform])

  useEffect(() => {
    if (visibleGroups.some((group) => group.id === groupId)) return
    if (visibleGroups[0]) setGroupId(visibleGroups[0].id)
  }, [groupId, visibleGroups])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleMockups = useMemo(() => catalog.mockups.filter((mockup) => {
    if (platform !== "all" && mockup.platform !== platform) return false
    if (!normalizedQuery) return mockup.groupId === groupId
    const bundle = catalog.bundles.find((entry) => entry.id === mockup.bundleId)
    return `${mockup.name} ${mockup.description} ${mockup.style} ${bundle?.name ?? ""} ${bundle?.author ?? ""}`.toLowerCase().includes(normalizedQuery)
  }), [catalog.bundles, catalog.mockups, groupId, normalizedQuery, platform])
  const selectedGroup = catalog.groups.find((group) => group.id === groupId)
  const selectedBundle = catalog.bundles.find((bundle) => bundle.id === selectedGroup?.bundleId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(820px,calc(100vh-2rem))] max-w-6xl grid-rows-[auto_auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-4 border-b px-5 py-4 pr-14">
          <DialogHeader className="min-w-0 flex-1">
            <DialogTitle>Choose a device frame</DialogTitle>
            <DialogDescription>Browse {catalog.mockups.length} Apple mockups. Your selected screenshot stays in place when you switch frames.</DialogDescription>
          </DialogHeader>
          <MockupBundleImporter onImported={(mockupId, nextCatalog) => {
            const imported = deviceMockupById(nextCatalog, mockupId)
            onValueChange(mockupId)
            if (imported) {
              setPlatform(imported.platform)
              setGroupId(imported.groupId)
            }
          }} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <InputGroup className="min-w-56 flex-1">
            <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
            <InputGroupInput aria-label="Search device frames" placeholder="Search devices, styles, or colors" value={query} onChange={(event) => setQuery(event.target.value)} />
          </InputGroup>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {platformOptions.map((option) => (
              <Button
                aria-pressed={platform === option.id}
                className={cn(
                  "text-muted-foreground",
                  platform === option.id && "bg-background text-foreground shadow-sm hover:bg-background",
                )}
                key={option.id}
                size="sm"
                variant="ghost"
                onClick={() => setPlatform(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 overflow-hidden grid-cols-[15rem_minmax(0,1fr)]">
          <ScrollArea className="h-full min-h-0 overflow-hidden border-r">
            <div className="space-y-1 p-2 pb-5">
              {visibleGroups.map((group) => (
                <Button
                  className="h-auto w-full justify-start gap-3 px-2 py-2 text-left"
                  key={group.id}
                  variant={!normalizedQuery && group.id === groupId ? "secondary" : "ghost"}
                  onClick={() => {
                    setGroupId(group.id)
                    setQuery("")
                  }}
                >
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/70 p-1">
                    <img alt="" className="size-full min-h-0 min-w-0 object-contain" src={group.thumbnailUrl} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal text-xs font-medium leading-tight">{group.name}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{group.count} {group.count === 1 ? "frame" : "frames"}</span>
                  </span>
                </Button>
              ))}
            </div>
          </ScrollArea>

          <div className="flex min-h-0 overflow-hidden flex-col">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-medium">{normalizedQuery ? "Search results" : selectedGroup?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {visibleMockups.length} {visibleMockups.length === 1 ? "frame" : "frames"}
                  {selectedBundle && !normalizedQuery ? ` · ${selectedBundle.name} · ${selectedBundle.license.name}` : ""}
                </p>
              </div>
            </div>
            <ScrollArea className="h-full min-h-0 flex-1 overflow-hidden">
              {loading && catalog.mockups.length === 0 ? (
                <div className="grid h-48 place-items-center text-sm text-muted-foreground">Loading device frames…</div>
              ) : catalogError && catalog.mockups.length === 0 ? (
                <div className="grid h-48 place-items-center px-8 text-center text-sm text-destructive">{catalogError}</div>
              ) : visibleMockups.length === 0 ? (
                <div className="grid h-48 place-items-center text-sm text-muted-foreground">No frames match your search.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4 pb-8 lg:grid-cols-3">
                  {visibleMockups.map((mockup) => (
                    <Button
                      aria-label={`Use ${mockup.name}, ${mockup.description}`}
                      aria-pressed={mockup.id === value}
                      className={cn(
                        "group relative h-auto flex-col items-stretch justify-start overflow-hidden rounded-xl bg-card p-0 text-left whitespace-normal outline-none transition hover:border-foreground/30 hover:bg-card hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0",
                        mockup.id === value && "border-foreground ring-1 ring-foreground",
                      )}
                      key={mockup.id}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        onValueChange(mockup.id)
                        onOpenChange(false)
                      }}
                    >
                      <div className="relative h-40 overflow-hidden bg-[linear-gradient(45deg,var(--color-muted)_25%,transparent_25%),linear-gradient(-45deg,var(--color-muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--color-muted)_75%),linear-gradient(-45deg,transparent_75%,var(--color-muted)_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0px]">
                        <img alt="" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain transition-transform group-hover:scale-[1.02]" loading="lazy" src={mockup.thumbnailUrl} />
                      </div>
                      <div className="border-t px-3 py-2.5">
                        <p className="truncate text-xs font-medium">{mockup.description}</p>
                        {normalizedQuery && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{mockup.name}</p>}
                      </div>
                      {mockup.id === value && <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-foreground text-background"><Check className="size-3.5" /></span>}
                    </Button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
