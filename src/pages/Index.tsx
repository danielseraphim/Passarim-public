import { BirdTranslator } from "@/components/BirdTranslator";

const Index = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-xl">
        <header className="text-center">
          <h1 className="font-serif text-5xl font-semibold leading-[1.05] text-canopy md:text-6xl">
            Passarim
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground md:text-lg">
            Grave um som e ouça como ele soaria no assobio de um pássaro brasileiro.
          </p>
        </header>

        <div className="mt-10">
          <BirdTranslator />
        </div>

        <p className="mt-10 text-center font-serif text-sm italic text-muted-foreground">
          Da sua voz, um novo assobio.
        </p>
      </div>
    </main>
  );
};

export default Index;
