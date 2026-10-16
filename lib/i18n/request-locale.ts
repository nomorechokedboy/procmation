import { cookies, headers } from "next/headers";
import {
  baseLocale,
  cookieName,
  isLocale,
  type Locale,
  locales,
} from "@/paraglide/runtime";

function fromAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) {
    return;
  }
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
    const match = locales.find((locale) => locale === tag);
    if (match) {
      return match;
    }
  }
}

/**
 * The locale for this request: the language cookie, then Accept-Language,
 * then the base locale. The root layout passes it to LocaleBoundary, which
 * makes it the locale every message function uses while rendering.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(cookieName)?.value;
  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }
  return (
    fromAcceptLanguage((await headers()).get("accept-language")) ?? baseLocale
  );
}
