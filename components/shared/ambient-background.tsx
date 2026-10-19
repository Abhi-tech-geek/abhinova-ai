// Ambient animated gradient blobs — pure CSS (transform/opacity only, GPU
// friendly). prefers-reduced-motion freezes them via the media query in
// globals.css, leaving a calm static glow.
export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="ambient-blob left-[8%] top-[15%] bg-primary/15" />
      <div
        className="ambient-blob right-[10%] top-[55%] bg-accent/10"
        style={{ animationDelay: "-8s" }}
      />
      <div
        className="ambient-blob left-[45%] top-[75%] bg-primary/10"
        style={{ animationDelay: "-16s" }}
      />
    </div>
  );
}
