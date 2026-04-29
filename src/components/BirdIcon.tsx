// Bird icons — loaded as SVG assets from /public/birds/.
//
// We used to render bird shapes via inline SVG generated in code; that
// hit a quality ceiling we couldn't get past without a real illustrator.
// The user now generates each bird as a finished SVG (via Claude Design)
// and drops them in public/birds/. This component just references them
// by key.

import { BIRDS } from "@/lib/birdSynth";

export type BirdKey = keyof typeof BIRDS;

type IconProps = {
  birdKey: BirdKey;
  className?: string;
  /** Kept for API compatibility with the old inline-SVG version. */
  noHalo?: boolean;
};

export function BirdIcon({ birdKey, className }: IconProps) {
  const bird = BIRDS[birdKey];
  return (
    <img
      src={`/birds/${birdKey}.svg`}
      alt={bird.name}
      className={className}
      // The asset is self-contained (halo + lines + accent baked in).
      draggable={false}
    />
  );
}

/** Small colour chip — used as a flat accent dot next to bird names. */
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
