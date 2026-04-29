interface WaveformProps {
  level: number;
  active: boolean;
  bars?: number;
  className?: string;
  variant?: "light" | "dark";
}

export const Waveform = ({
  level,
  active,
  bars = 48,
  className = "",
  variant = "dark",
}: WaveformProps) => {
  const color = variant === "dark" ? "bg-[hsl(var(--leaf))]" : "bg-primary/70";
  return (
    <div className={`flex h-16 items-center justify-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }).map((_, i) => {
        const seed = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        const base = 0.25 + Math.abs(seed) * 0.75;
        const heightPct = active
          ? Math.max(8, base * (20 + level * 80))
          : 12 + base * 18;
        return (
          <span
            key={i}
            className={`w-[3px] rounded-full ${color} transition-[height] duration-100`}
            style={{
              height: `${heightPct}%`,
              animation: active ? `wave 1.2s ease-in-out ${i * 0.04}s infinite` : undefined,
              opacity: active ? 0.9 : 0.55,
            }}
          />
        );
      })}
    </div>
  );
};
