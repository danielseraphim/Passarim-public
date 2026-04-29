// Brazilian-bird-inspired whistle synthesizer.
// Inspired loosely by sabiá-laranjeira, bem-te-vi, sanhaçu, and uirapuru calls.
//
// Approach (rewrite, april 2026):
//   1. Detect syllable onsets in the recorded audio using a smoothed RMS
//      envelope plus a spectral-flux-style novelty score. We do NOT try to
//      transpose the user's pitch literally — voice/ambient pitch is unreliable
//      and a literal transpose sounds nothing like a bird. Instead we treat the
//      input's RHYTHM and LOUDNESS profile as the score, and let the bird
//      profile determine the timbre and pitch language.
//   2. For each syllable we schedule a short whistle event with a randomly
//      chosen pitch contour (rise / fall / U / inverted-U / trill). Real bird
//      syllables are 30–300ms with sweeping pitch — not a steady tone with
//      vibrato sprinkled on top.
//   3. Timbre = sine fundamental + a small (≈12%) second harmonic, both routed
//      through a tight bandpass centred on the bird's range. The bandpass plus
//      an exponential decay envelope is what gives the "wet" whistle quality.
//   4. A tiny breath-noise burst at the attack of each syllable adds the
//      consonant articulation that pure-sine implementations always miss.

export type BirdProfile = {
  name: string;
  emoji: string;
  baseFreq: number; // center pitch in Hz
  pitchRange: number; // Hz of total pitch excursion within a syllable
  trill: number; // characteristic trill / warble rate (Hz)
  warble: number; // 0..1 — likelihood of trill-shaped syllables
  description: string;
};

export const BIRDS: Record<string, BirdProfile> = {
  sabia: {
    name: "Sabiá-laranjeira",
    emoji: "🧡",
    baseFreq: 2200,
    pitchRange: 700,
    trill: 6,
    warble: 0.35,
    description: "Brazil's national bird. Melodic, flute-like phrases.",
  },
  bemtevi: {
    name: "Bem-te-vi",
    emoji: "💛",
    baseFreq: 2600,
    pitchRange: 1100,
    trill: 5,
    warble: 0.5,
    description: "The classic three-note jungle shout.",
  },
  uirapuru: {
    name: "Uirapuru",
    emoji: "✨",
    baseFreq: 2900,
    pitchRange: 1300,
    trill: 11,
    warble: 0.85,
    description: "Mythical Amazon songbird, intricate trills.",
  },
  sanhacu: {
    name: "Sanhaçu",
    emoji: "💙",
    baseFreq: 3300,
    pitchRange: 800,
    trill: 8,
    warble: 0.55,
    description: "Bright, chirpy garden whistler.",
  },
};

/**
 * MicRecorder: simple two-step recorder. Captures raw mic to a Float32Array.
 */
export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array | null = null;
  private rafId: number | null = null;

  onLevel?: (level: number) => void;

  async start() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);

    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
    };
    this.source.connect(this.processor);
    // Must connect to destination for ScriptProcessor to fire — use silent gain.
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    this.processor.connect(silent).connect(this.ctx.destination);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
    this.tick();
  }

  private tick = () => {
    if (!this.analyser || !this.analyserBuf) return;
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i++)
      sum += this.analyserBuf[i] * this.analyserBuf[i];
    const rms = Math.sqrt(sum / this.analyserBuf.length);
    this.onLevel?.(Math.min(1, rms * 8));
    this.rafId = requestAnimationFrame(this.tick);
  };

  async stop(): Promise<{ samples: Float32Array; sampleRate: number }> {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const sampleRate = this.ctx?.sampleRate ?? 44100;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.analyser = null;
    this.analyserBuf = null;

    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    this.chunks = [];
    return { samples: out, sampleRate };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Syllable detection — find the rhythmic backbone of the input.
// ────────────────────────────────────────────────────────────────────────────

type Syllable = {
  start: number; // seconds
  duration: number; // seconds (0.06..0.35)
  amplitude: number; // 0..1
};

function detectSyllables(samples: Float32Array, sampleRate: number): Syllable[] {
  const frameLen = Math.floor(sampleRate * 0.01); // 10ms frames
  const numFrames = Math.floor(samples.length / frameLen);
  if (numFrames < 4) return [];

  // Frame energy (RMS) profile.
  const energy = new Float32Array(numFrames);
  let peakEnergy = 1e-6;
  for (let f = 0; f < numFrames; f++) {
    let sumSq = 0;
    const off = f * frameLen;
    for (let i = 0; i < frameLen; i++) {
      const s = samples[off + i];
      sumSq += s * s;
    }
    energy[f] = Math.sqrt(sumSq / frameLen);
    if (energy[f] > peakEnergy) peakEnergy = energy[f];
  }

  // Smooth (3-tap moving average) to suppress spikes.
  const smooth = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const a = f > 0 ? energy[f - 1] : energy[f];
    const b = energy[f];
    const c = f < numFrames - 1 ? energy[f + 1] : energy[f];
    smooth[f] = (a + b + c) / 3;
  }

  // Onsets: positive derivative crossing above a relative threshold,
  // with a refractory period so we don't spam syllables.
  const threshold = peakEnergy * 0.18;
  const refractoryFrames = 8; // ~80ms minimum syllable gap
  const onsets: number[] = [];
  let lastOnset = -refractoryFrames;
  for (let f = 1; f < numFrames - 1; f++) {
    const rising = smooth[f] > smooth[f - 1] && smooth[f] >= smooth[f + 1];
    if (
      rising &&
      smooth[f] > threshold &&
      f - lastOnset >= refractoryFrames
    ) {
      onsets.push(f);
      lastOnset = f;
    }
  }

  // If the audio is mostly stationary (rain, traffic, hum), no peaks will
  // dominate — fall back to a regular pulse driven by the overall envelope.
  if (onsets.length === 0) {
    const totalDur = samples.length / sampleRate;
    const count = Math.max(3, Math.min(14, Math.round(totalDur / 0.3)));
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count) * totalDur;
      onsets.push(Math.floor((t * sampleRate) / frameLen));
    }
  }

  // Build syllable list with amplitude + duration.
  const out: Syllable[] = [];
  for (let k = 0; k < onsets.length; k++) {
    const f = onsets[k];
    const next = k + 1 < onsets.length ? onsets[k + 1] : numFrames;
    const gapFrames = next - f;
    const duration = Math.min(0.35, Math.max(0.07, gapFrames * 0.01 * 0.85));
    out.push({
      start: (f * frameLen) / sampleRate,
      duration,
      amplitude: Math.min(1, smooth[f] / peakEnergy + 0.15),
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Pitch contours — five shapes, picked per syllable.
// ────────────────────────────────────────────────────────────────────────────

type ContourShape = "rise" | "fall" | "arch" | "dip" | "trill";

function pickShape(bird: BirdProfile, rng: () => number): ContourShape {
  if (rng() < bird.warble * 0.6) return "trill";
  const r = rng();
  if (r < 0.28) return "rise";
  if (r < 0.55) return "fall";
  if (r < 0.78) return "arch";
  return "dip";
}

/**
 * Build a list of (time, frequency) breakpoints for a syllable, relative to
 * the syllable start. We keep them coarse (≈8 points) — the AudioParam linear
 * ramps interpolate smoothly.
 */
function buildContour(
  shape: ContourShape,
  bird: BirdProfile,
  duration: number,
  rng: () => number,
): { t: number; f: number }[] {
  const center = bird.baseFreq * (0.92 + rng() * 0.16); // small per-syllable jitter
  const span = bird.pitchRange * (0.55 + rng() * 0.55);
  const lo = center - span / 2;
  const hi = center + span / 2;

  const pts: { t: number; f: number }[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const u = i / N; // 0..1
    let f = center;
    switch (shape) {
      case "rise":
        f = lo + (hi - lo) * u;
        break;
      case "fall":
        f = hi - (hi - lo) * u;
        break;
      case "arch": {
        // sin curve: up then down
        f = lo + (hi - lo) * Math.sin(u * Math.PI);
        break;
      }
      case "dip": {
        // inverted arch: start mid, dip, return
        f = hi - (hi - lo) * Math.sin(u * Math.PI);
        break;
      }
      case "trill": {
        const wob = Math.sin(u * Math.PI * 2 * bird.trill * duration);
        f = center + wob * (span / 2);
        break;
      }
    }
    pts.push({ t: u * duration, f });
  }
  return pts;
}

// ────────────────────────────────────────────────────────────────────────────
// Offline render.
// ────────────────────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  // Mulberry32 — deterministic per render, so two retranslates of the same
  // recording with the same bird sound the same.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseBuffer(ctx: OfflineAudioContext, durationSec: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Render a bird-whistle interpretation of the recorded buffer.
 */
export async function translateToBird(
  samples: Float32Array,
  sampleRate: number,
  bird: BirdProfile,
  options: { includeMic?: boolean; micGain?: number } = {},
): Promise<Float32Array> {
  const duration = samples.length / sampleRate;
  if (duration < 0.05) return new Float32Array(0);

  // Add a small tail so the last syllable can decay naturally.
  const tail = 0.4;
  const totalLen = Math.floor((duration + tail) * sampleRate);
  const offline = new OfflineAudioContext(1, totalLen, sampleRate);

  // Master chain: bandpass shaped on the bird's range → soft compressor → out.
  // Bandpass keeps the timbre focused (the "whistle" character); without it the
  // second harmonic makes everything sound like a square wave.
  const bandpass = offline.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = bird.baseFreq;
  bandpass.Q.value = 1.4;

  const highshelf = offline.createBiquadFilter();
  highshelf.type = "highshelf";
  highshelf.frequency.value = 6000;
  highshelf.gain.value = -8;

  const master = offline.createGain();
  master.gain.value = 0.85;

  bandpass.connect(highshelf).connect(master).connect(offline.destination);

  const syllables = detectSyllables(samples, sampleRate);
  const rng = makeRng(syllables.length * 1009 + Math.floor(bird.baseFreq));

  // For each syllable, schedule a fresh oscillator pair + gain envelope.
  // Doing it per-syllable (rather than one long oscillator with tons of ramps)
  // is what makes them sound like discrete notes rather than a continuous slide.
  for (const syl of syllables) {
    const shape = pickShape(bird, rng);
    const contour = buildContour(shape, bird, syl.duration, rng);

    // --- Fundamental ---
    const osc = offline.createOscillator();
    osc.type = "sine";

    // --- Second harmonic for warmth (small) ---
    const osc2 = offline.createOscillator();
    osc2.type = "sine";
    const osc2Gain = offline.createGain();
    osc2Gain.gain.value = 0.12 + rng() * 0.05;

    // Vibrato LFO (small, varies per syllable so it doesn't sound robotic).
    const lfo = offline.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5 + rng() * 4;
    const lfoDepth = offline.createGain();
    lfoDepth.gain.value =
      shape === "trill" ? 0 : 12 + rng() * 18; // Hz; muted for trills
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc.frequency);
    lfoDepth.connect(osc2.frequency);

    // Schedule pitch contour breakpoints.
    const t0 = syl.start;
    const f0 = contour[0].f;
    osc.frequency.setValueAtTime(f0, t0);
    osc2.frequency.setValueAtTime(f0 * 2, t0);
    for (let i = 1; i < contour.length; i++) {
      osc.frequency.linearRampToValueAtTime(contour[i].f, t0 + contour[i].t);
      osc2.frequency.linearRampToValueAtTime(
        contour[i].f * 2,
        t0 + contour[i].t,
      );
    }

    // Amplitude envelope: very fast attack, exponential decay.
    // Peak amplitude scales with syllable amplitude AND duration (short
    // syllables peak louder so they read as articulated chirps).
    const env = offline.createGain();
    const peak =
      Math.min(0.42, 0.18 + syl.amplitude * 0.32) *
      (0.7 + 0.4 * Math.min(1, 0.18 / syl.duration));
    const attack = 0.008;
    const release = 0.04;

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    env.gain.setValueAtTime(peak, t0 + Math.max(attack, syl.duration - release));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + syl.duration + 0.05);

    osc.connect(env);
    osc2.connect(osc2Gain).connect(env);
    env.connect(bandpass);

    osc.start(t0);
    osc2.start(t0);
    lfo.start(t0);
    const stopAt = t0 + syl.duration + 0.08;
    osc.stop(stopAt);
    osc2.stop(stopAt);
    lfo.stop(stopAt);

    // --- Breath/articulation noise burst at the attack ---
    const noiseBuf = makeNoiseBuffer(offline, 0.04);
    const noiseSrc = offline.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseBp = offline.createBiquadFilter();
    noiseBp.type = "bandpass";
    noiseBp.frequency.value = bird.baseFreq * 1.1;
    noiseBp.Q.value = 8;
    const noiseGain = offline.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.06 * syl.amplitude, t0 + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
    noiseSrc.connect(noiseBp).connect(noiseGain).connect(bandpass);
    noiseSrc.start(t0);
    noiseSrc.stop(t0 + 0.04);
  }

  // Optional: mix the original mic in (kept for the "incluir minha voz" toggle).
  if (options.includeMic) {
    const micBuf = offline.createBuffer(1, samples.length, sampleRate);
    micBuf.getChannelData(0).set(samples);
    const micSrc = offline.createBufferSource();
    micSrc.buffer = micBuf;
    const micGain = offline.createGain();
    micGain.gain.value = options.micGain ?? 0.4;
    micSrc.connect(micGain).connect(offline.destination);
    micSrc.start(0);
  }

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Play a Float32Array sample buffer through an AudioContext, return a stop fn. */
export function playSamples(
  samples: Float32Array,
  sampleRate: number,
): { stop: () => void; ended: Promise<void> } {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  const ended = new Promise<void>((resolve) => {
    src.onended = () => {
      resolve();
      ctx.close();
    };
  });
  src.start(0);
  return {
    stop: () => {
      try {
        src.stop();
      } catch {}
      ctx.close();
    },
    ended,
  };
}
