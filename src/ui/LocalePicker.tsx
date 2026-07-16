import { useState } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { APP_STORE_LOCALES, appStoreLocale, type AppStoreLocale } from "@/app-store-locales"

interface LocalePickerProps {
  id?: string
  value: string
  onValueChange: (locale: string) => void
}

export function LocalePicker({ id, value, onValueChange }: LocalePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = appStoreLocale(value)

  return (
    <Combobox
      autoHighlight
      filter={(locale, inputValue) => localeLabel(locale).toLocaleLowerCase().includes(inputValue.trim().toLocaleLowerCase())}
      highlightItemOnHover
      inputValue={open ? query : selected.name}
      isItemEqualToValue={(locale, selectedLocale) => locale.code === selectedLocale.code}
      itemToStringLabel={localeLabel}
      items={APP_STORE_LOCALES}
      open={open}
      value={selected}
      onInputValueChange={setQuery}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        setQuery("")
      }}
      onValueChange={(locale) => {
        if (locale) onValueChange(locale.code)
      }}
    >
      <ComboboxInput id={id} aria-label="Language / locale" className="w-full" placeholder="Search App Store locales…" showClear={false} />
      <ComboboxContent className="w-[320px]">
        <ComboboxEmpty>No matching App Store locale.</ComboboxEmpty>
        <ComboboxList className="max-h-72 py-1">
          {(locale: AppStoreLocale) => (
            <ComboboxItem key={locale.code} value={locale}>
              <span className="min-w-0 truncate">{locale.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{locale.code}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function localeLabel(locale: AppStoreLocale): string {
  return `${locale.name} · ${locale.code}`
}
