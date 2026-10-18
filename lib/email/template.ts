import { getAppOrigin } from "@/lib/app-url";
import * as m from "@/paraglide/messages";
import type { Locale } from "@/paraglide/runtime";

const HTML_ESCAPES: Record<string, string> = {
  "'": "&#39;",
  '"': "&quot;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const HTML_SPECIAL_REGEX = /[&<>"']/g;

function escapeHtml(value: string): string {
  return value.replace(
    HTML_SPECIAL_REGEX,
    (char) => HTML_ESCAPES[char] ?? char
  );
}

export function appName(): string {
  return process.env.APP_NAME || "Procmation";
}

// Emails are written in one language for everyone, chosen by EMAIL_LOCALE
export function emailLocale(): Locale {
  return process.env.EMAIL_LOCALE === "vi" ? "vi" : "en";
}

type Layout = {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  locale: Locale;
};

// Plain, table-free markup that renders the same in every mail client
export function renderEmail(layout: Layout): { html: string; text: string } {
  const footer = m.email_footer({ app: appName() }, { locale: layout.locale });
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
<h1 style="font-size:18px;margin:0 0 12px;">${escapeHtml(layout.heading)}</h1>
<p style="font-size:14px;line-height:1.5;margin:0 0 20px;">${escapeHtml(layout.body)}</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(layout.ctaUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;">${escapeHtml(layout.ctaLabel)}</a></p>
<p style="font-size:12px;color:#666;margin:0;">${escapeHtml(footer)}</p>
</div></body></html>`;
  const text = `${layout.heading}\n\n${layout.body}\n\n${layout.ctaLabel}: ${layout.ctaUrl}\n\n${footer}`;
  return { html, text };
}

export function appLink(path: string, request?: Request): string {
  return `${getAppOrigin(request)}${path}`;
}
