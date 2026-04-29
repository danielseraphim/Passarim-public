// Family of stylized perched-bird icons — same compositional base, different
// accent colour placement per species.

import { BIRDS, BirdProfile } from "@/lib/birdSynth";

export type BirdKey = keyof typeof BIRDS;

type Variant = "perch-chest" | "perch-back" | "perch-wing" | "perch-spot";

const VARIANTS: Record<BirdKey, Variant> = {
  bemtevi: "perch-chest",
  sabia: "perch-chest",
  uirapuru: "perch-spot",
  azulao: "perch-back",
  tiesangue: "perch-wing",
  sanhacu: "perch-chest",
};

type IconProps = {
  birdKey: BirdKey;
  className?: string;
  accent?: string;
  surface?: string;
};

export function BirdIcon({ birdKey, className, accent, surface }: IconProps) {
  const bird: BirdProfile = BIRDS[birdKey];
  const variant = VARIANTS[birdKey];
  const fill = accent ?? bird.accent;
  const bg = surface ?? "transparent";

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={bird.name}
    >
      <ellipse cx="32" cy="34" rx="22" ry="28" fill={bg} stroke="none" />
      <path d="M 14,52 Q 32,50 50,53" />
      <path d="M 11,32 L 4,28" />
      <path d="M 11,33 L 3,33" />
      <path d="M 11,34 L 4,38" />
      <path
        d="M 11,33 C 11,22 22,18 32,19 C 42,20 49,24 50,30 C 51,34 49,37 46,38 C 44,38 41,38 38,40 L 22,42 L 14,40 Z"
        fill={bg === "transparent" ? "white" : bg}
      />
      {variant === "perch-chest" && (
        <path
          d="M 24,28 C 28,26 36,26 42,30 C 40,36 32,38 24,35 Z"
          fill={fill}
          fillOpacity={0.9}
          stroke="none"
        />
      )}
      {variant === "perch-back" && (
        <path
          d="M 18,24 C 24,21 36,21 44,25 C 42,29 32,30 22,29 Z"
          fill={fill}
          fillOpacity={0.9}
          stroke="none"
        />
      )}
      {variant === "perch-wing" && (
        <path
          d="M 22,28 C 28,26 34,28 38,33 C 36,37 28,38 22,35 Z"
          fill={fill}
          fillOpacity={0.9}
          stroke="none"
        />
      )}
      {variant === "perch-spot" && (
        <ellipse cx="32" cy="32" rx="6" ry="4" fill={fill} fillOpacity={0.95} stroke="none" />
      )}
      <path d="M 18,32 Q 24,36 32,36" />
      <path d="M 50,28 L 56,29 L 50,31 Z" fill={fill} stroke="currentColor" strokeWidth={1.4} />
      <circle cx="46" cy="26" r="0.9" fill="currentColor" stroke="none" />
      <path d="M 26,42 L 26,50" />
      <path d="M 36,42 L 36,50" />
    </svg>
  );
}
