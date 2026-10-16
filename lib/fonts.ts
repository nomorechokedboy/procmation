import {
  Geist_Mono as createMono,
  Geist as createSans,
} from "next/font/google";

export const sans = createSans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-sans",
  weight: "variable",
});

export const mono = createMono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: "variable",
});
