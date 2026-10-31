import { z } from "zod";

// Agent Mode tool arguments. They come from the model, so they're validated
// like any other untrusted input before a tool runs.

export const wikipediaSearchArgs = z.object({ query: z.string().trim().min(1).max(200) });
export const readWebpageArgs = z.object({ url: z.string().trim().url().max(2000) });
export const searchMyDocumentsArgs = z.object({ query: z.string().trim().min(1).max(500) });
export const calculatorArgs = z.object({ expression: z.string().trim().min(1).max(200) });
