import { useEffect, useRef, useState } from "react";
import { Mic, Square, Download, ChevronDown, Play, RotateCcw, Loader2 } from "lucide-react";
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
import { encodeWAV } from "@/lib/wav";
import { toast } from "@/hooks/use-toast";
import { Waveform } from "@/components/Waveform";

type Stage = "idle" | "recording" | "translating" | "result";

export const BirdTranslator = () => {
  const [stage, setStage] = useState<Stage>("idle");
  const [birdKey, setBirdKey] = useState<keyof typeof BIRDS>("sabia");
  const [level, setLevel] = useState(0);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [includeMic, setIncludeMic] = useState(false);
  const [recordedSamples, setRecordedSamples] = useState<Float32Array | null>(null);
  const [birdSamples, setBirdSamples] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState(44100);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const playbackRef = useRef<{ stop: () => void } | null>(null);

  const bird: BirdProfile = BIRDS[birdKey];

  useEffect(() => {
    return () => {
      recorderRef.current?.stop().catch(() => {});
      playbackRef.current?.stop();
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
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
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const blob = encodeWAV(out, sr);
    setDownloadUrl(URL.createObjectURL(blob));
    setStage("result");
  };

  const reset = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
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

  const download = () => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `passarim-${bird.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const isRecording = stage === "recording";
  const isTranslating = stage === "translating";
  const hasResult = stage === "result";

  const statusText =
    stage === "idle"
      ? "pronto para gravar"
      : isRecording
        ? `gravando · ${recordSeconds}s`
        : isTranslating
          ? "traduzindo para pássaro…"
          : "tradução pronta";

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-[28px] bg-canopy p-6 text-primary-foreground shadow-card md:p-8">
        <Waveform
          level={isRecording ? level : hasResult ? 0.5 : 0}
          active={isRecording || hasResult}
          variant="dark"
          className="mb-6"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-sm text-primary-foreground/80">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                isRecording
                  ? "bg-destructive animate-shimmer"
                  : isTranslating
                    ? "bg-[hsl(var(--leaf))] animate-shimmer"
                    : hasResult
                      ? "bg-[hsl(var(--leaf))]"
                      : "bg-primary-foreground/40"
              }`}
            />
            <span className="truncate">{statusText}</span>
          </div>

          {/* Main action button */}
          {isTranslating ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--cream))] text-canopy shadow-glow">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : hasResult ? (
            <button
              onClick={playBird}
              aria-label="ouvir tradução"
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--leaf))] text-canopy shadow-glow transition-transform hover:scale-105 active:scale-95"
            >
              <Play className="h-7 w-7 fill-current" />
            </button>
          ) : (
            <button
              onClick={isRecording ? stopAndTranslate : startRecording}
              aria-label={isRecording ? "parar gravação" : "começar a gravar"}
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--cream))] text-canopy shadow-glow transition-transform hover:scale-105 active:scale-95"
            >
              {isRecording && (
                <span className="absolute inset-0 rounded-full bg-destructive/40 animate-pulse-ring" />
              )}
              {isRecording ? (
                <Square className="h-6 w-6 fill-current" />
              ) : (
                <Mic className="h-7 w-7" strokeWidth={2.2} />
              )}
            </button>
          )}

          {/* Bird selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={isRecording || isTranslating}
                className="flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-4 py-2 text-sm hover:bg-primary-foreground/10 disabled:opacity-50"
              >
                {bird.name.toLowerCase()}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {Object.entries(BIRDS).map(([k, b]) => (
                <DropdownMenuItem
                  key={k}
                  onClick={() => {
                    setBirdKey(k as keyof typeof BIRDS);
                    if (hasResult) retranslate({ bird: b });
                  }}
                >
                  <span className="mr-2">{b.emoji}</span>
                  <span>{b.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Hint + options */}
        <div className="mt-6 flex flex-col items-center gap-3 border-t border-primary-foreground/10 pt-5">
          <span className="text-center text-xs uppercase tracking-[0.25em] text-primary-foreground/60">
            {stage === "idle" && "clique no microfone para começar"}
            {isRecording && "clique no quadrado para parar e traduzir"}
            {isTranslating && "preparando o assobio…"}
            {hasResult && "clique no play para ouvir o pássaro"}
          </span>

          <div className="flex items-center gap-3 rounded-full border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-2">
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
              className="cursor-pointer text-xs text-primary-foreground/85"
            >
              incluir minha voz junto
            </Label>
          </div>
        </div>

        {/* Result actions */}
        {hasResult && downloadUrl && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <audio src={downloadUrl} controls className="w-full" />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={download}
                size="sm"
                className="bg-[hsl(var(--cream))] text-canopy hover:bg-[hsl(var(--cream))]/90"
              >
                <Download className="mr-2 h-4 w-4" /> baixar wav
              </Button>
              <Button
                onClick={reset}
                variant="outline"
                size="sm"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> nova gravação
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};