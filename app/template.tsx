// Page transition on every route change (template remounts per navigation).
// Pure CSS (tailwindcss-animate), NOT framer-motion: framer server-renders the
// `initial` state inline (opacity 0), which left whole pages invisible/faded
// until hydration finished on slow devices. CSS plays on first paint.
// Fast (200ms), transform/opacity only, disabled for reduced-motion users.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="duration-200 ease-out animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      {children}
    </div>
  );
}
