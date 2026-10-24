import { z } from "zod";
import { DASHBOARD_RANGES } from "@/types/admin";

// /admin usage dashboard.
export const adminLoginSchema = z.object({
  key: z.string().trim().min(1).max(200),
});

/** ?days=7|14|30 — anything else falls back to 14. */
export const dashboardRangeSchema = z.coerce
  .number()
  .refine((n): n is (typeof DASHBOARD_RANGES)[number] => (DASHBOARD_RANGES as readonly number[]).includes(n))
  .catch(14);
