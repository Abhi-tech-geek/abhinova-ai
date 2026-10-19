"use client";

import { motion } from "framer-motion";
import { CRISIS_HELPLINES } from "@/lib/wellness/crisis";

// Persistent support card shown when a crisis signal is detected. Caring, not
// clinical. Deliberately has NO dismiss button — it stays for the session.
export function CrisisCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-primary/40 bg-primary/10 p-4"
      data-testid="wellness-crisis-card"
    >
      <p className="text-sm font-medium">You don&apos;t have to carry this alone. 💙</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Talking to a real person can help more than anything right now — someone
        you trust, or one of these free, confidential helplines:
      </p>
      <ul className="mt-3 space-y-1.5">
        {CRISIS_HELPLINES.map((line) => (
          <li key={line.number} className="flex items-center gap-2 text-sm">
            <a
              href={`tel:${line.number.replace(/-/g, "")}`}
              className="font-mono font-semibold text-primary underline-offset-4 hover:underline"
              data-testid={`wellness-helpline-${line.number}`}
            >
              {line.number}
            </a>
            <span className="text-xs text-muted-foreground">{line.name}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
