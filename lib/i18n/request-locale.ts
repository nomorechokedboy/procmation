import { cookies } from "next/headers";
import {
  baseLocale,
  cookieName,
  isLocale,
  type Locale,
} from "@/paraglide/runtime";

/**
 * The locale for this request: the language cookie a person set with the
 * language switcher, otherwise the base locale (Vietnamese). The browser's
 * Accept-Language is deliberately ignored, so the app opens in Vietnamese for
 * everyone until they choose otherwise. The root layout passes it to
 * LocaleBoundary, which makes it the locale every message function uses while
 * rendering.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(cookieName)?.value;
  return isLocale(cookieLocale) ? cookieLocale : baseLocale;
}
