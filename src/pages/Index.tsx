import { BirdTranslator } from "@/components/BirdTranslator";

/** Decorative leaf-sprig used above the title and below the tagline. */
const LeafSprig = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M20 4 C 22 8, 24 10, 28 11 M20 4 C 18 8, 16 10, 12 11 M20 4 L 20 16"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M28 11 C 30 9, 32 8, 34 9 C 32 11, 30 12, 28 11 Z"
      fill="currentColor"
      fillOpacity="0.6"
    />
    <path
      d="M12 11 C 10 9, 8 8, 6 9 C 8 11, 10 12, 12 11 Z"
      fill="currentColor"
      fillOpacity="0.6"
    />
  </svg>
);

/** Wavy underline divider with a leaf in the middle. */
const TitleDivider = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 16" fill="none" aria-hidden="true" className={className}>
    <path
      d="M 4 8 Q 28 4, 52 8 T 100 8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeOpacity="0.5"
    />
    <path
      d="M 196 8 Q 172 12, 148 8 T 100 8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeOpacity="0.5"
    />
    <path
      d="M 100 4 C 102 6, 104 7, 106 8 C 104 9, 102 10, 100 12 C 98 10, 96 9, 94 8 C 96 7, 98 6, 100 4 Z"
      fill="currentColor"
      fillOpacity="0.7"
    />
  </svg>
);

const Index = () => {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-6 py-16">
      {/* Subtle leaf shadow in the background corners */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[hsl(var(--leaf))]/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-[hsl(var(--leaf))]/10 blur-3xl"
      />

      <div className="relative w-full max-w-xl text-center">
        <LeafSprig className="mx-auto mb-3 h-5 w-10 text-[hsl(var(--leaf))]" />
        <h1 className="font-serif text-5xl font-semibold leading-[1.05] text-canopy md:text-6xl">
          Passarim
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground md:text-lg">
          Cante ou assobie uma melodia e ouça um pássaro brasileiro repetindo.
        </p>
        <TitleDivider className="mx-auto mt-6 h-3 w-44 text-[hsl(var(--canopy))]" />

        <div className="mt-10 text-left">
          <BirdTranslator />
        </div>

        <p className="mt-10 flex items-center justify-center gap-3 font-serif text-sm italic text-muted-foreground">
          <LeafSprig className="h-3 w-6 text-[hsl(var(--leaf))]/70" />
          Da sua voz, um novo canto.
          <LeafSprig className="h-3 w-6 -scale-x-100 text-[hsl(var(--leaf))]/70" />
        </p>
      </div>
    </main>
  );
};

export default Index;
