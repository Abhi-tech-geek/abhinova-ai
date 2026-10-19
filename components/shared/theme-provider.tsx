"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Three themes: dark (default), light, wellness. `attribute="class"` puts the
// theme class on <html>, which activates the token sets in globals.css.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light", "wellness"]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
