import type { MetadataRoute } from "next";
import { isOpenBeta } from "@/lib/beta/config";

// During the open beta the app is for invited testers only — keep it out of
// search engines (every crawler visit would otherwise be a guest session).
export default function robots(): MetadataRoute.Robots {
  return isOpenBeta()
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] } };
}
