import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ReactFlowProvider } from "@xyflow/react";
import { Provider } from "jotai";
import { type ReactNode, Suspense } from "react";
import { AuthProvider } from "@/components/auth/provider";
import { GitHubStarsLoader } from "@/components/github-stars-loader";
import { GitHubStarsProvider } from "@/components/github-stars-provider";
import { GlobalModals } from "@/components/global-modals";
import { LocaleBoundary } from "@/components/locale-boundary";
import { OverlayProvider } from "@/components/overlays/overlay-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PersistentCanvas } from "@/components/workflow/persistent-canvas";
import { mono, sans } from "@/lib/fonts";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { cn } from "@/lib/utils";
import type { Locale } from "@/paraglide/runtime";

export const metadata: Metadata = {
  description:
    "Build powerful AI-driven workflow automations with a visual, node-based editor. Built with Next.js and React Flow.",
  title: "AI Workflow Builder - Visual Workflow Automation",
};

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  width: "device-width",
};

type RootLayoutProps = {
  children: ReactNode;
};

// Inner content wrapped by GitHubStarsProvider (used for both loading and loaded states)
function LayoutContent({
  children,
  locale,
}: {
  children: ReactNode;
  locale: Locale;
}) {
  return (
    <ReactFlowProvider>
      <PersistentCanvas />
      <LocaleBoundary locale={locale}>
        <div className="pointer-events-none relative z-10">{children}</div>
      </LocaleBoundary>
    </ReactFlowProvider>
  );
}

const RootLayout = async ({ children }: RootLayoutProps) => {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={cn(sans.variable, mono.variable, "antialiased")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <Provider>
            <AuthProvider>
              <OverlayProvider>
                <Suspense
                  fallback={
                    <GitHubStarsProvider stars={null}>
                      <LayoutContent locale={locale}>{children}</LayoutContent>
                    </GitHubStarsProvider>
                  }
                >
                  <GitHubStarsLoader>
                    <LayoutContent locale={locale}>{children}</LayoutContent>
                  </GitHubStarsLoader>
                </Suspense>
                <Toaster />
                <GlobalModals />
              </OverlayProvider>
            </AuthProvider>
          </Provider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
};

export default RootLayout;
