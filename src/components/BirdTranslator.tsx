import { useEffect, useRef, useState } from "react";
import { Mic, Square, ChevronDown, Play, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BIRDS,
  BirdProfile,
  MicRecorder,
  translateToBird,
  playSamples,
} from "@/lib/birdSynth";
import { encodeMP3 } from "@/lib/mp3";
import { toast } from "@/hooks/use-toast";
import { Waveform } from "@/components/Waveform";
import { BirdIcon, BirdKey } from "@/components/BirdIcon";

type Stage = "idle" | "recording" | "translating" | "result";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  </svg>
);

export const BirdTranslator = () => {
  const [stage, setStage] = useState<Stage>("idle");
  const [birdKey, setBirdKey] = useState<BirdKey>("bemtevi");
  const [level, setLevel] = useState(0);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [includeMic, setIncludeMic] = useState(false);
  const [recordedSamples, setRecordedSamples] = useState<Float32Array | null>(null);
  const [birdSamples, setBirdSamples] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState(44100);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const playbackRef = useRef<{ stop: () => void } | null>(null);

  const bird: BirdProfile = BIRDS[birdKey];

  useEffect(() => {
    return () => {
      recorderRef.current?.stop().catch(() => {});
      playbackRef.current?.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderTranslation = async (
    samples: Float32Array,
    sr: number,
    chosen: BirdProfile,
    mixMic: boolean,
  ) => {
    const out = await translateToBird(samples, sr, chosen, {
      includeMic: mixMic,
      micGain: 0.4,
    });
    setBirdSamples(out);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const blob = encodeMP3(out, sr);
    setAudioBlob(blob);
    setAudioUrl(URL.createObjectURL(blob));
    setStage("result");
  };

  const reset = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordedSamples(null);
    setBirdSamples(null);
    setRecordSeconds(0);
    setLevel(0);
    setStage("idle");
  };

  const startRecording = async () => {
    try {
      const rec = new MicRecorder();
      rec.onLevel = (lv) => setLevel(lv);
      await rec.start();
      recorderRef.current = rec;
      setRecordSeconds(0);
      setStage("recording");
      recordTimerRef.current = window.setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000,
      );
    } catch (e: any) {
      toast({
        title: "Microfone necessário",
        description: e?.message ?? "Permita o acesso ao microfone para gravar.",
        variant: "destructive",
      });
    }
  };

  const stopAndTranslate = async () => {
    if (!recorderRef.current) return;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const { samples, sampleRate: sr } = await recorderRef.current.stop();
    recorderRef.current = null;
    setLevel(0);

    if (samples.length / sr < 0.3) {
      toast({
        title: "Gravação muito curta",
        description: "Tente gravar pelo menos meio segundo.",
      });
      setStage("idle");
      return;
    }

    setRecordedSamples(samples);
    setSampleRate(sr);
    setStage("translating");

    try {
      await renderTranslation(samples, sr, bird, includeMic);
    } catch (e: any) {
      toast({
        title: "Falha ao traduzir",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive",
      });
      setStage("idle");
    }
  };

  const retranslate = async (overrides?: { bird?: BirdProfile; includeMic?: boolean }) => {
    if (!recordedSamples) return;
    playbackRef.current?.stop();
    setStage("translating");
    await renderTranslation(
      recordedSamples,
      sampleRate,
      overrides?.bird ?? bird,
      overrides?.includeMic ?? includeMic,
    );
  };

  const playBird = () => {
    if (!birdSamples) return;
    playbackRef.current?.stop();
    playbackRef.current = playSamples(birdSamples, sampleRate);
  };

  const shareOnWhatsApp = async () => {
    if (!audioBlob) return;
    const filename = `passarim-${bird.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.mp3`;
    const file = new File([audioBlob], filename, { type: "audio/mpeg" });
    const text = `🐦 ${bird.name} repetindo minha melodia — feito no passarim`;

    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], title: "Passarim", text });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }

    const a = document.createElement("a");
    a.href = audioUrl ?? URL.createObjectURL(audioBlob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text + " — áudio anexo 👆")}`,
      "_blank",
      "noopener,noreferrer",
    );
    toast({
      title: "Anexar manualmente",
      description:
        "Seu navegador não anexa direto no WhatsApp. O áudio foi baixado — arraste-o pra conversa.",
    });
  };

  const isRecording = stage === "recording";
  const isTranslating = stage === "translating";
  const hasResult = stage === "result";

  const statusText =
    stage === "idle"
      ? "Pronto para gravar"
      : isRecording
        ? `Gravando · ${recordSeconds}s`
        : isTranslating
          ? "Traduzindo para pássaro"
          : "Tradução pronta";

  const hintText =
    stage === "idle"
      ? "Clique no microfone e cante uma melodia"
      : isRecording
        ? "Clique no quadrado para parar e traduzir"
        : isTranslating
          ? "Preparando o assobio"
          : "Clique no play para ouvir o pássaro";

  return (
    <div className="w-full">
      <div
        className="relative overflow-hidden rounded-[28px] p-6 md:p-14"
        style={{
          background: "linear-gradient(135deg, #1F4734 0%, #143425 70%)",
          color: "var(--cream)",
          boxShadow: "var(--shadow-card-deep)",
        }}
      >
        <Waveform
          level={isRecording ? level : hasResult ? 0.5 : 0}
          active={isRecording || hasResult}
          variant="dark"
          className="mb-6"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--lime)" }}>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  isRecording
                    ? "bg-red-400 animate-shimmer"
                    : isTranslating
                      ? "animate-shimmer"
                      : hasResult
                        ? ""
                        : "opacity-40"
                }`}
                style={{ backgroundColor: isRecording ? undefined : "var(--lime)", boxShadow: !isRecording && (isTranslating || hasResult) ? "0 0 8px var(--lime)" : undefined }}
              />
              <span className="truncate">{statusText}</span>
            </div>
            <div className="font-serif text-[20px] italic" style={{ color: "var(--cream)" }}>
              {hintText}
            </div>
          </div>

          {isTranslating ? (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--lime)", color: "var(--green-deep)", boxShadow: "0 12px 30px -8px rgba(184, 218, 99, 0.5)" }}
            >
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : hasResult ? (
            <button
              onClick={playBird}
              aria-label="Ouvir tradução"
              className="relative flex h-24 w-24 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: "var(--lime)", color: "var(--green-deep)", boxShadow: "0 12px 30px -8px rgba(184, 218, 99, 0.5)" }}
            >
              <Play className="h-8 w-8 fill-current" />
            </button>
          ) : (
            <button
              onClick={isRecording ? stopAndTranslate : startRecording}
              aria-label={isRecording ? "Parar gravação" : "Começar a gravar"}
              className="relative flex h-24 w-24 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: isRecording ? "rgba(245,241,229,0.95)" : "var(--cream)", color: "var(--green-deep)", boxShadow: "0 12px 30px -8px rgba(184, 218, 99, 0.5)" }}
            >
              {isRecording && (
                <span className="absolute inset-0 rounded-full bg-red-500/30 animate-pulse-ring" />
              )}
              {isRecording ? (
                <Square className="h-7 w-7 fill-current" />
              ) : (
                <Mic className="h-8 w-8" strokeWidth={2.0} />
              )}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={isRecording || isTranslating}
                className="flex items-center gap-3 rounded-full py-2 pl-2 pr-4 text-[15px] transition-colors disabled:opacity-50"
                style={{
                  border: "1px solid rgba(184, 218, 99, 0.4)",
                  backgroundColor: "rgba(15, 42, 31, 0.4)",
                  color: "var(--cream)",
                }}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--halo)" }}
                >
                  <BirdIcon birdKey={birdKey} className="h-9 w-9" />
                </span>
                <span>{bird.name.toLowerCase()}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2" style={{ backgroundColor: "var(--cream)", color: "var(--green)" }}>
              {(Object.keys(BIRDS) as BirdKey[]).map((k) => {
                const b = BIRDS[k];
                return (
                  <DropdownMenuItem
                    key={k}
                    onClick={() => {
                      setBirdKey(k);
                      if (hasResult) retranslate({ bird: b });
                    }}
                    className="gap-3 rounded-xl py-2"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--halo)" }}
                    >
                      <BirdIcon birdKey={k} className="h-9 w-9" />
                    </span>
                    <span className="flex-1 text-[14px]">{b.name.toLowerCase()}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Divider "ouça como ficou" — só visível com result */}
        {hasResult && (
          <div className="relative my-7 h-px" style={{ backgroundColor: "rgba(184, 218, 99, 0.15)" }}>
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-4 text-[11px] uppercase tracking-[0.32em]"
              style={{ background: "linear-gradient(135deg, #1F4734 0%, #143425 70%)", color: "rgba(184, 218, 99, 0.6)" }}
            >
              ouça como ficou
            </span>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <div
            className="flex items-center gap-3 rounded-full px-5 py-2.5"
            style={{
              border: "1px solid rgba(184, 218, 99, 0.3)",
              backgroundColor: "rgba(15, 42, 31, 0.3)",
            }}
          >
            <Switch
              id="include-mic"
              checked={includeMic}
              onCheckedChange={(v) => {
                setIncludeMic(v);
                if (hasResult) retranslate({ includeMic: v });
              }}
              disabled={isRecording || isTranslating}
            />
            <Label
              htmlFor="include-mic"
              className="cursor-pointer text-[13px]"
              style={{ color: "var(--cream)" }}
            >
              Incluir minha voz junto
            </Label>
          </div>
        </div>

        {hasResult && audioUrl && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <audio src={audioUrl} controls className="w-full" />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={shareOnWhatsApp}
                size="sm"
                className="bg-[#25D366] text-white hover:bg-[#1ebe5a]"
              >
                <WhatsAppIcon className="mr-2 h-4 w-4" /> Compartilhar no WhatsApp
              </Button>
              <Button
                onClick={reset}
                variant="outline"
                size="sm"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Nova gravação
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
