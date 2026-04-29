// Refined family of line-art birds. Each bird shares the same compositional
// language — perched silhouette on a small sprig, soft oval halo behind,
// fine 1.6-1.8 px outline in `currentColor` — but varies in:
//   - body proportions (rounder/slimmer)
//   - tail length and orientation
//   - head tilt
//   - placement of the accent colour patch (chest, wing, back, throat)
// The goal is family resemblance with individual character.

import { BIRDS, BirdProfile } from "@/lib/birdSynth";

export type BirdKey = keyof typeof BIRDS;

type IconProps = {
  birdKey: BirdKey;
  className?: string;
  accent?: string;
  surface?: string;
  /** if true, omit the soft halo behind the bird */
  noHalo?: boolean;
};

export function BirdIcon({ birdKey, className, accent, surface, noHalo }: IconProps) {
  const bird: BirdProfile = BIRDS[birdKey];
  const fill = accent ?? bird.accent;
  const bg = surface ?? "hsl(var(--cream))";

  // Each bird gets its own SVG body so they actually look distinct, not just
  // the same shape with different colours.
  const body = BIRD_PATHS[birdKey](fill);

  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={bird.name}
    >
      {!noHalo && <ellipse cx="40" cy="44" rx="30" ry="36" fill={bg} stroke="none" />}
      {body}
    </svg>
  );
}

// Each entry returns a JSX fragment with the bird's body parts in z-order:
// branch → tail → body fill → wing → accent patch → head/beak/eye → legs.
const BIRD_PATHS: Record<BirdKey, (accent: string) => JSX.Element> = {
  // Bem-te-vi — chunky body, raised crest hint, large yellow chest
  bemtevi: (a) => (
    <>
      {/* Branch with a leaf */}
      <path d="M 14,62 Q 40,60 64,63" />
      <path
        d="M 56,63 Q 60,59 64,60 Q 62,63 58,64"
        fill={a}
        fillOpacity="0.35"
        stroke="none"
      />
      {/* Tail */}
      <path d="M 14,42 L 6,38 M 14,43 L 4,43 M 14,44 L 6,49" />
      {/* Body */}
      <path
        d="M 14,43 C 14,30 24,24 36,24 C 50,24 60,28 62,38 C 63,44 60,48 56,49 L 36,52 L 18,49 Z"
        fill="white"
      />
      {/* Wing line */}
      <path d="M 22,42 Q 32,46 42,46" />
      {/* Yellow chest patch (signature of bem-te-vi) */}
      <path
        d="M 24,38 C 30,34 46,34 54,40 C 50,46 36,48 24,44 Z"
        fill={a}
        stroke="none"
      />
      {/* Black eye-mask */}
      <path
        d="M 50,30 C 54,29 58,29 60,31"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
        opacity="0.85"
      />
      {/* Beak */}
      <path d="M 62,33 L 70,34 L 62,36 Z" fill="currentColor" />
      {/* Eye */}
      <circle cx="56" cy="31" r="1" fill="currentColor" stroke="none" />
      {/* Legs */}
      <path d="M 30,52 L 30,62 M 42,52 L 42,62" />
    </>
  ),

  // Sabiá-laranjeira — slimmer, orange chest
  sabia: (a) => (
    <>
      <path d="M 14,62 Q 40,60 66,62" />
      <path d="M 12,40 L 4,36 M 12,41 L 3,41 M 12,42 L 4,46" />
      <path
        d="M 12,42 C 12,30 22,24 34,23 C 50,22 62,28 62,37 C 62,44 56,48 50,48 L 32,51 L 16,48 Z"
        fill="white"
      />
      <path d="M 22,40 Q 32,44 44,44" />
      {/* Orange belly patch */}
      <path
        d="M 26,40 C 32,38 46,38 52,42 C 48,48 34,49 26,46 Z"
        fill={a}
        stroke="none"
      />
      <path d="M 62,32 L 70,33 L 62,35 Z" fill="currentColor" />
      <circle cx="56" cy="29" r="0.9" fill="currentColor" stroke="none" />
      <path d="M 28,51 L 28,62 M 40,51 L 40,62" />
    </>
  ),

  // Uirapuru — slim, smaller, red breast spot
  uirapuru: (a) => (
    <>
      <path d="M 14,62 Q 40,61 66,62" />
      <path d="M 14,38 L 6,32 M 14,39 L 5,38 M 14,40 L 7,44" />
      <path
        d="M 14,40 C 14,30 22,25 33,24 C 47,24 58,28 58,36 C 58,42 52,46 46,46 L 32,49 L 18,46 Z"
        fill="white"
      />
      <path d="M 22,38 Q 30,42 40,42" />
      {/* Small red breast spot */}
      <ellipse cx="36" cy="40" rx="7" ry="3.5" fill={a} stroke="none" />
      <path d="M 58,30 L 66,31 L 58,33 Z" fill="currentColor" />
      <circle cx="52" cy="28" r="0.9" fill="currentColor" stroke="none" />
      <path d="M 28,49 L 28,62 M 40,49 L 40,62" />
    </>
  ),

  // Azulão — broad, blue back/wing
  azulao: (a) => (
    <>
      <path d="M 12,62 Q 40,60 68,62" />
      <path d="M 12,40 L 4,36 M 12,41 L 3,41 M 12,42 L 4,46" />
      <path
        d="M 12,42 C 12,28 22,22 36,22 C 52,22 64,28 64,38 C 64,46 58,50 50,50 L 32,52 L 16,49 Z"
        fill="white"
      />
      {/* Blue wing/back patch (top half of body) */}
      <path
        d="M 14,38 C 18,24 36,20 56,26 C 60,28 62,32 60,36 C 50,38 30,38 14,40 Z"
        fill={a}
        stroke="none"
      />
      <path d="M 22,42 Q 32,46 44,46" />
      <path d="M 64,32 L 72,33 L 64,35 Z" fill="currentColor" />
      <circle cx="58" cy="30" r="1" fill="currentColor" stroke="none" />
      <path d="M 28,52 L 28,62 M 42,52 L 42,62" />
    </>
  ),

  // Tiê-sangue — green wing/cape on a slim body
  tiesangue: (a) => (
    <>
      <path d="M 14,62 Q 40,60 66,62" />
      <path d="M 14,40 L 6,36 M 14,41 L 5,41 M 14,42 L 6,46" />
      <path
        d="M 14,42 C 14,30 24,24 36,23 C 50,22 62,28 62,38 C 62,44 56,48 50,48 L 32,51 L 18,48 Z"
        fill="white"
      />
      {/* Green wing (mid-back) */}
      <path
        d="M 20,36 C 28,30 44,30 56,34 C 54,42 40,44 20,42 Z"
        fill={a}
        stroke="none"
      />
      <path d="M 24,42 Q 34,45 44,45" />
      <path d="M 62,32 L 70,33 L 62,35 Z" fill="currentColor" />
      <circle cx="56" cy="30" r="0.9" fill="currentColor" stroke="none" />
      <path d="M 30,51 L 30,62 M 42,51 L 42,62" />
    </>
  ),

  // Sanhaçu — soft, full body, lavender chest sweep
  sanhacu: (a) => (
    <>
      <path d="M 12,62 Q 40,60 68,62" />
      <path d="M 12,42 L 4,38 M 12,43 L 3,43 M 12,44 L 4,48" />
      <path
        d="M 12,44 C 12,30 22,24 36,24 C 52,24 64,30 64,40 C 64,48 58,50 50,50 L 32,52 L 16,50 Z"
        fill="white"
      />
      <path d="M 22,44 Q 32,46 44,46" />
      {/* Lavender chest */}
      <path
        d="M 24,42 C 32,38 50,38 56,44 C 50,50 32,52 22,48 Z"
        fill={a}
        stroke="none"
      />
      <path d="M 64,33 L 72,34 L 64,36 Z" fill="currentColor" />
      <circle cx="58" cy="31" r="1" fill="currentColor" stroke="none" />
      <path d="M 30,52 L 30,62 M 42,52 L 42,62" />
    </>
  ),
};

/** Small colour chip — used in dropdowns next to bird names. */
export function BirdAccentDot({
  birdKey,
  className,
}: {
  birdKey: BirdKey;
  className?: string;
}) {
  const accent = BIRDS[birdKey].accent;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        width: "0.5rem",
        height: "0.5rem",
        borderRadius: "9999px",
        backgroundColor: accent,
      }}
    />
  );
}
