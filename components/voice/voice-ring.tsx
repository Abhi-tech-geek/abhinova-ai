"use client";

import { motion, useReducedMotion } from "framer-motion";

// Amplitude-style pulsing rings around the mic while listening.
export function VoiceRing() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <span className="pointer-events-none absolute inset-0 rounded-[13px] border-2 border-primary/60" />
    );
  }

  return (
    <>
      {[0, 0.5].map((delay) => (
        <motion.span
          key={delay}
          className="pointer-events-none absolute inset-0 rounded-[13px] border-2 border-primary/50"
          animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay }}
        />
      ))}
      <motion.span
        className="pointer-events-none absolute inset-0 rounded-[13px] bg-primary/15"
        animate={{ scale: [1, 1.12, 1] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}
