import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { AmbientBackground } from "@/components/shared/ambient-background";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorker } from "@/components/shared/service-worker";
import "./globals.css";

// Design source uses Space Grotesk everywhere (sans + display) + JetBrains Mono.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://abhinova.theabhinavsaxena.in"),
  title: {
    default: "AbhiNova AI — your futuristic AI workspace",
    template: "%s · AbhiNova AI",
  },
  description:
    "A productivity-first AI workspace: chat, QA Studio for testers, document intelligence, and a code studio — with an optional Wellness Mode.",
  openGraph: {
    title: "AbhiNova AI",
    description: "A futuristic, productivity-first AI workspace.",
    url: "https://abhinova.theabhinavsaxena.in",
    siteName: "AbhiNova AI",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  // PWA (manifest in app/manifest.ts): iOS home-screen icon + standalone mode.
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "AbhiNova", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#06070d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <AmbientBackground />
          {children}
          <Toaster toastOptions={{ className: "glass" }} />
          <ServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
