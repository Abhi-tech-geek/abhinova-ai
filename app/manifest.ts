import type { MetadataRoute } from "next";

// Web app manifest → "Install app" / "Add to Home screen" on phones and desktops.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AbhiNova AI",
    short_name: "AbhiNova",
    description:
      "A productivity-first AI workspace: chat, QA Studio for testers, document Q&A and a code studio — in English, Hindi and Hinglish.",
    id: "/chat",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06070d",
    theme_color: "#06070d",
    categories: ["productivity", "developer", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New chat", url: "/chat" },
      { name: "QA Studio", url: "/qa-studio" },
      { name: "Projects", url: "/projects" },
    ],
  };
}
