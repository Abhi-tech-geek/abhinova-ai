// Brand mark from the design source: gradient tile with the 4-point star SVG +
// the "Abhi{Nova}" wordmark where Nova is the solid accent color.

export function BrandStar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#fff" className={className} aria-hidden>
      <path d="M12 1l2.2 8L22 12l-7.8 2.9L12 23l-2.2-8.1L2 12l7.8-2.9z" />
    </svg>
  );
}

export function Logo({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const tile = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-14 w-14" }[size];
  const star = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-7 w-7" }[size];
  const text = { sm: "text-base", md: "text-lg", lg: "text-4xl" }[size];

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`brand-gradient inline-flex ${tile} shrink-0 items-center justify-center rounded-full shadow-glow-primary`}
        aria-hidden
      >
        <BrandStar className={star} />
      </span>
      {withWordmark && (
        <span className={`font-display ${text} font-semibold tracking-tight`}>
          Abhi<span className="text-primary">Nova</span>
        </span>
      )}
    </span>
  );
}
