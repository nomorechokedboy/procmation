"use client";

import type { ReactNode } from "react";
import { type Locale, overwriteGetLocale } from "@/paraglide/runtime";

type LocaleBoundaryProps = {
  locale: Locale;
  children: ReactNode;
};

// Server rendering has no access to the browser cookie, so the server picks the
// locale and hands it down here. Overwriting getLocale during render makes the
// server HTML and the first client render use the same language.
export function LocaleBoundary({ locale, children }: LocaleBoundaryProps) {
  overwriteGetLocale(() => locale);
  return children;
}
