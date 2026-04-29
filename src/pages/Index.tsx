import { BirdTranslator } from "@/components/BirdTranslator";
import { BIRDS, BirdProfile } from "@/lib/birdSynth";
import { BirdKey } from "@/components/BirdIcon";

/* ────────────────────────────────────────────────────────────────────────
 * Decorative SVG marks. The handoff design uses a few small ornaments
 * (gold feather, leaf flourishes) that anchor the sections without being
 * loud. Keep them small and few — minimalism is the brief.
 * ──────────────────────────────────────────────────────────────────────── */

const FeatherMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M30 6 Q 14 6 10 22 Q 8 30 12 32 Q 16 34 22 30 Q 32 22 30 6 Z" />
    <path d="M14 28 L 6 36" />
    <path d="M16 24 L 26 14" />
  </svg>
);

const HeroDivider = () => (
  <div className="mt-7 flex items-center justify-center gap-3 text-[var(--green-soft)]">
    <span className="h-px w-14 bg-[var(--rule)]" />
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-3.5 w-3.5 opacity-60" aria-hidden="true">
      <path d="M7 1 L 7 7 M3 4 Q 5 6 7 7 M11 4 Q 9 6 7 7" />
    </svg>
    <span className="h-px w-14 bg-[var(--rule)]" />
  </div>
);

const Crown = ({ color, className }: { color: string; className?: string }) => (
  <svg viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d="M11 5 L 11 13" />
    <path d="M6 6 C 7 9, 9 11, 11 11.5" />
    <path d="M16 6 C 15 9, 13 11, 11 11.5" />
    <circle cx="11" cy="4" r="1.5" fill={color} stroke="none" />
  </svg>
);

const TinyLeaf = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" className={className}>
    <path d="M2 12 Q 6 8 8 4 Q 10 8 14 12" />
  </svg>
);

const BirdCard = ({ birdKey, bird }: { birdKey: BirdKey; bird: BirdProfile }) => (
  <article className="rounded-[18px] p-6 transition-colors hover:bg-[rgba(26,61,46,0.04)]">
    <Crown color={bird.accent} className="mx-auto mb-2 h-5 w-5 opacity-85" />
    <div className="mx-auto mb-4 aspect-square w-full max-w-[160px]">
      <img
        src={`/birds/${birdKey}.svg`}
        alt={bird.name}
        className="h-full w-full"
        draggable={false}
      />
    </div>
    <h3 className="text-center font-serif text-2xl font-medium text-[var(--green)]">
      {bird.name.toLowerCase()}
    </h3>
    <p className="mx-auto mt-2 max-w-[180px] text-center text-[13px] leading-relaxed text-[var(--green-soft)]">
      {bird.description}
    </p>

    <dl className="mt-5 space-y-2.5 text-[12px] leading-snug">
      <div>
        <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--green-soft)]">
          Nome científico
        </dt>
        <dd className="font-serif italic text-[14px] text-[var(--green)]">
          {bird.sciName}
        </dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--green-soft)]">
          Bioma
        </dt>
        <dd className="text-[var(--green)]">{bird.biome}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--green-soft)]">
          Vocalização
        </dt>
        <dd className="text-[var(--green)]">{bird.vocalization}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--green-soft)]">
          Curiosidade
        </dt>
        <dd className="text-[var(--green-soft)] italic">{bird.trivia}</dd>
      </div>
    </dl>
  </article>
);

const Index = () => {
  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: "var(--cream)", color: "var(--green)" }}
    >
      {/* ── HERO ── */}
      <section className="relative px-6 pt-20 pb-10 text-center md:px-14 md:pt-24">
        <FeatherMark className="mx-auto mb-5 h-9 w-9 text-[var(--gold)]" />
        <h1
          className="font-serif text-[var(--green)]"
          style={{ fontSize: "clamp(72px, 10vw, 132px)", lineHeight: 0.95, letterSpacing: "-0.02em", fontWeight: 500 }}
        >
          passarim
        </h1>
        <p className="mx-auto mt-5 max-w-[580px] text-[17px] leading-[1.55] text-[var(--green-soft)]">
          Grave um som e ouça como ele soaria no assobio de um pássaro brasileiro.
          <br />
          Sua voz, traduzida em melodia da mata.
        </p>
        <HeroDivider />
      </section>

      {/* ── PLAYER ── */}
      <section className="relative mx-auto max-w-[980px] px-6 pb-16 md:px-14 md:pb-24">
        <BirdTranslator />

        <p
          className="mt-12 flex items-center justify-center gap-3 text-center font-serif text-[22px] italic text-[var(--green-soft)]"
        >
          <TinyLeaf className="h-4 w-4 opacity-50" />
          Da sua voz, um novo assobio.
          <TinyLeaf className="h-4 w-4 -scale-x-100 opacity-50" />
        </p>
      </section>

      {/* ── NOSSOS CANTORES (enriquecida com nome científico, bioma, vocalização, trivia) ── */}
      <section
        className="relative px-6 py-20 md:px-14 md:py-28"
        style={{ backgroundColor: "var(--cream)" }}
      >
        <div className="mx-auto max-w-[1240px]">
          <header className="mb-14 text-center">
            <div className="mb-4 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.32em] text-[var(--green-soft)]">
              <span className="h-px w-10 bg-[var(--rule)]" />
              ícones de pássaros
              <span className="h-px w-10 bg-[var(--rule)]" />
            </div>
            <h2
              className="font-serif text-[var(--green)]"
              style={{ fontSize: "clamp(48px, 6vw, 72px)", lineHeight: 1, letterSpacing: "-0.02em", fontWeight: 500 }}
            >
              nossos cantores
            </h2>
            <p className="mx-auto mt-5 max-w-[460px] text-[15px] leading-[1.6] text-[var(--green-soft)]">
              Cada pássaro, um tom da natureza. Cada{" "}
              <em className="not-italic text-[var(--green)] italic">assobio, uma tradução única.</em>
            </p>
          </header>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(BIRDS) as BirdKey[]).map((k) => (
              <BirdCard key={k} birdKey={k} bird={BIRDS[k]} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
