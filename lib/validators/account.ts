import { z } from "zod";

/** "Delete my data" must be confirmed explicitly — a stray request can't wipe anything. */
export const deleteMyDataSchema = z.object({
  confirm: z.literal("DELETE"),
});
