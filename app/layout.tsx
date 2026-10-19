import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { AmbientBackground } from "@/components/shared/ambient-background";
import { Toaster } from "@/components/ui/sonner";
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
    // TODO: replace with a real 1200x630 image at public/og.png
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
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
        </ThemeProvider>
      </body>
    </html>
  );
}
