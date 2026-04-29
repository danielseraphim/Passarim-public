import type React from "react";
import { BirdTranslator } from "@/components/BirdTranslator";

/* Decorative SVG pieces — all line-art, all in CSS-controlled colour. */

const FrondShape = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg viewBox="0 0 240 360" fill="none" aria-hidden="true" className={className} style={style}>
    <path
      d="M 120 350 C 110 280 90 220 60 170 M 120 350 C 130 280 150 220 180 170 M 120 350 L 120 80"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const t = i / 6;
      const yL = 70 + t * 240;
      const yR = 70 + t * 240;
      const lenL = 90 - i * 6;
      const lenR = 90 - i * 6;
      return (
        <g key={i}>
          <path
            d={`M 120 ${yL} C ${110 - lenL * 0.4} ${yL - 14}, ${120 - lenL} ${yL - 4}, ${120 - lenL} ${yL + 8} C ${120 - lenL * 0.6} ${yL + 6}, ${120 - lenL * 0.3} ${yL + 4}, 120 ${yL} Z`}
            fill="currentColor"
            fillOpacity="0.22"
          />
          <path
            d={`M 120 ${yR} C ${110 + lenR * 0.4} ${yR - 14}, ${120 + lenR} ${yR - 4}, ${120 + lenR} ${yR + 8} C ${120 + lenR * 0.6} ${yR + 6}, ${120 + lenR * 0.3} ${yR + 4}, 120 ${yR} Z`}
            fill="currentColor"
            fillOpacity="0.22"
          />
        </g>
      );
    })}
  </svg>
);

const FlyingBird = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 220 140"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M 60 76 C 80 60 110 56 138 62 C 152 64 162 70 168 78 C 158 82 144 84 130 84 L 80 84 C 70 84 64 82 60 76 Z" />
    <path d="M 168 78 C 174 76 180 72 184 68 L 192 70 L 184 76 L 178 78 C 175 80 172 80 168 78 Z" />
    <circle cx="180" cy="72" r="0.8" fill="currentColor" stroke="none" />
    <path d="M 80 78 C 60 50 40 30 14 22 C 30 30 50 44 70 58 C 80 65 86 72 90 78" />
    <path d="M 80 82 C 64 96 50 102 30 110 C 50 108 70 104 86 96" opacity="0.7" />
    <path d="M 60 80 L 44 78" />
    <path d="M 60 82 L 42 84" />
    <path d="M 60 84 L 46 90" />
    <circle cx="200" cy="48" r="1.2" fill="currentColor" stroke="none" opacity="0.5" />
    <circle cx="210" cy="80" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
  </svg>
);

const TitleDivider = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 240 18" fill="none" aria-hidden="true" className={className}>
    <path d="M 4 9 Q 36 5, 68 9 T 110 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.45" />
    <path d="M 236 9 Q 204 13, 172 9 T 130 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.45" />
    <path d="M 120 3 C 122 5, 124 7, 126 9 C 124 11, 122 13, 120 15 C 118 13, 116 11, 114 9 C 116 7, 118 5, 120 3 Z" fill="currentColor" fillOpacity="0.7" />
  </svg>
);

const TinyLeaf = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 14" fill="none" aria-hidden="true" className={className}>
    <path d="M 2 7 Q 8 3, 14 7 T 22 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
    <path d="M 11 4 C 13 5, 15 6, 17 7 C 15 8, 13 9, 11 10 Z" fill="currentColor" fillOpacity="0.55" />
  </svg>
);

const CrowningLeaf = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 36" fill="none" aria-hidden="true" className={className}>
    <path
      d="M 16 6 C 22 12, 26 18, 24 28 C 22 32, 18 32, 16 30 C 14 32, 10 32, 8 28 C 6 18, 10 12, 16 6 Z"
      fill="url(#leafGradient)"
      stroke="currentColor"
      strokeWidth="1.0"
      strokeOpacity="0.45"
    />
    <path d="M 16 8 L 16 28" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.4" />
    <defs>
      <linearGradient id="leafGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="hsl(48, 75%, 65%)" stopOpacity="0.85" />
        <stop offset="1" stopColor="hsl(40, 65%, 50%)" stopOpacity="0.7" />
      </linearGradient>
    </defs>
  </svg>
);

const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden bg-cream">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 0% 100%, hsl(var(--leaf) / 0.22), transparent 70%), radial-gradient(ellipse 50% 50% at 100% 0%, hsl(var(--leaf) / 0.18), transparent 60%)",
        }}
      />

      <FrondShape className="pointer-events-none absolute -left-24 bottom-0 h-[70vh] max-h-[640px] w-auto text-[hsl(var(--canopy))] opacity-40 blur-[2px] animate-leaf-sway" />
      <FrondShape
        className="pointer-events-none absolute -right-32 top-12 h-[60vh] max-h-[560px] w-auto text-[hsl(var(--canopy))] opacity-30 blur-[2px] -scale-x-100"
        style={{ animation: "leaf-sway 9s ease-in-out infinite reverse" }}
      />
      <FrondShape className="pointer-events-none absolute -right-20 -bottom-16 h-[50vh] max-h-[500px] w-auto text-[hsl(var(--canopy))] opacity-30 blur-[3px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16">
        <div className="pointer-events-none absolute right-2 top-12 hidden md:block">
          <FlyingBird className="h-24 w-auto text-[hsl(35,75%,50%)] opacity-65" />
        </div>

        <div className="relative w-full text-center">
          <CrowningLeaf className="mx-auto mb-1 h-9 w-auto text-[hsl(40,70%,55%)]" />
          <h1 className="font-serif text-6xl font-semibold leading-[0.95] text-canopy md:text-7xl">
            Passarim
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground md:text-lg">
            Grave um som e ouça como ele soaria no canto de um pássaro brasileiro.
          </p>
          <TitleDivider className="mx-auto mt-6 h-4 w-52 text-canopy" />
        </div>

        <div className="relative mt-12 w-full">
          <BirdTranslator />
        </div>

        <p className="relative mt-12 flex items-center justify-center gap-3 font-serif text-sm italic text-muted-foreground md:text-base">
          <TinyLeaf className="h-3 w-5 text-[hsl(var(--leaf))]/70" />
          Da sua voz, um novo canto.
          <TinyLeaf className="h-3 w-5 -scale-x-100 text-[hsl(var(--leaf))]/70" />
        </p>
      </div>
    </main>
  );
};

export default Index;
