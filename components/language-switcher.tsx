"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCALE_NAMES } from "@/lib/i18n/locale-names";
import * as m from "@/paraglide/messages";
import {
  getLocale,
  type Locale,
  locales,
  setLocale,
} from "@/paraglide/runtime";

export function LanguageSwitcher() {
  return (
    <Select
      onValueChange={(value) => setLocale(value as Locale)}
      value={getLocale()}
    >
      <SelectTrigger
        aria-label={m.language_label()}
        className="h-8 w-auto gap-2 text-xs"
        data-testid="language-switcher"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {LOCALE_NAMES[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
