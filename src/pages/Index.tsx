import { BirdTranslator } from "@/components/BirdTranslator";

const Index = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <h1 className="font-serif text-4xl font-semibold leading-[1.05] text-canopy md:text-5xl">
          passarim
        </h1>
        <p className="mt-4 text-sm text-muted-foreground md:text-base">
          cante ou assobie uma melodia e ouça um pássaro brasileiro repetindo.
        </p>
        <div className="mt-10 text-left">
          <BirdTranslator />
        </div>
      </div>
    </main>
  );
};

export default Index;
