// Brazilian-bird-inspired whistle synthesizer — HYBRID, MUSICALLY OPINIONATED.
//
// Design choices (current rev — humanised calibration):
//   - Onsets drive syllable timings; pitch sampled at each onset; each
//     syllable is its OWN bird-shaped event. No continuous pitch tracking
//     between onsets ⇒ no theremin.
//   - Pitch is QUANTISED with MAGNETISM (~70 %) toward the nearest semitone.
//     Soft pull rather than rigid snap — the melody is tonally clear but
//     each note keeps a small expressive offset, so it doesn't sound like
//     a tuner-locked synth.
//   - Default contour shape is "flat", but flats now BREATHE (±4 cents
//     slow drift across the syllable). No long sweep, just gentle
//     instability — the difference between a held vocal note and a
//     sustained synth tone.
//   - Envelope is fast but NOT linear: exponential 5 ms attack and 10 ms
//     release. Crisp ictus without the digital-step click of a linear
//     ramp on amplitude.
//   - Ornaments only at phrase ends, low base probability.
//
// Pipeline:
//   YIN → median → octave-error correction → EMA → onset detection
//   (energy AND pitch jumps) → for each onset: magnetism-quantise, pick
//   contour shape, schedule grains → reverb / formant / limiter

const SOURCE_URL = "/whistle-source.ogg";
const SOURCE_PITCH = 1500;

let _cachedSourceAB: ArrayBuffer | null = null;
let _cachedSourcePromise: Promise<ArrayBuffer> | null = null;

async function getSourceArrayBuffer(): Promise<ArrayBuffer> {
  if (_cachedSourceAB) return _cachedSourceAB.slice(0);
  if (!_cachedSourcePromise) {
    _cachedSourcePromise = (async () => {
      const resp = await fetch(SOURCE_URL);
      if (!resp.ok) throw new Error(`whistle source ${resp.status}`);
      const ab = await resp.arrayBuffer();
      _cachedSourceAB = ab;
      return ab;
    })();
  }
  await _cachedSourcePromise;
  return _cachedSourceAB!.slice(0);
}

export type BirdProfile = {
  name: string;
  accent: string;
  baseFreq: number;
  pitchRange: number;
  trill: number;
  warble: number;
  formantFreq: number;
  formantQ: number;
  attackHardness: number;
  description: string;
};

export const BIRDS: Record<string, BirdProfile> = {
  bemtevi: {
    name: "Bem-te-vi", accent: "#F2C94C",
    baseFreq: 2400, pitchRange: 700, trill: 4.0, warble: 0.5,
    formantFreq: 2800, formantQ: 3.5, attackHardness: 0.7,
    description: "O guardião da manhã, canto claro que abre o dia na natureza.",
  },
  sabia: {
    name: "Sabiá-laranjeira", accent: "#E67E22",
    baseFreq: 2100, pitchRange: 600, trill: 3.5, warble: 0.6,
    formantFreq: 2400, formantQ: 3.0, attackHardness: 0.3,
    description: "Poeta da paisagem, seu canto é memória e tradição.",
  },
  uirapuru: {
    name: "Uirapuru", accent: "#E74C3C",
    baseFreq: 2500, pitchRange: 900, trill: 7.0, warble: 1.0,
    formantFreq: 2700, formantQ: 2.5, attackHardness: 0.5,
    description: "Raro e misterioso, seu canto ecoa como encantamento da mata.",
  },
  azulao: {
    name: "Azulão", accent: "#2D7DD2",
    baseFreq: 2200, pitchRange: 400, trill: 2.5, warble: 0.3,
    formantFreq: 2200, formantQ: 4.5, attackHardness: 0.4,
    description: "Força e beleza, seu canto é firme e marcante.",
  },
  tiesangue: {
    name: "Tiê-sangue", accent: "#6BAF6B",
    baseFreq: 2800, pitchRange: 500, trill: 5.0, warble: 0.5,
    formantFreq: 3200, formantQ: 4.0, attackHardness: 0.7,
    description: "Pequeno notável, seu canto é alegria que contagia.",
  },
  sanhacu: {
    name: "Sanhaçu", accent: "#A48DBA",
    baseFreq: 3000, pitchRange: 500, trill: 4.0, warble: 0.6,
    formantFreq: 3500, formantQ: 3.0, attackHardness: 0.6,
    description: "Cores que cantam, sua presença é pura vibração.",
  },
};

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

function decimate(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return samples;
  const outLen = Math.floor(samples.length / factor);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    const start = i * factor;
    for (let j = 0; j < factor; j++) sum += samples[start + j];
    out[i] = sum / factor;
  }
  return out;
}

function yinPitch(
  frame: Float32Array,
  sampleRate: number,
  threshold = 0.12,
): { f0: number; conf: number } {
  const halfN = frame.length >> 1;
  if (halfN < 8) return { f0: 0, conf: 0 };
  const diff = new Float32Array(halfN);
  for (let tau = 0; tau < halfN; tau++) {
    let s = 0;
    for (let i = 0; i < halfN; i++) {
      const d = frame[i] - frame[i + tau];
      s += d * d;
    }
    diff[tau] = s;
  }
  const cmnd = new Float32Array(halfN);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau < halfN; tau++) {
    run += diff[tau];
    cmnd[tau] = run > 0 ? (diff[tau] * tau) / run : 1;
  }
  const minLag = Math.max(2, Math.floor(sampleRate / 3500));
  const maxLag = Math.min(halfN - 2, Math.floor(sampleRate / 80));
  if (maxLag <= minLag) return { f0: 0, conf: 0 };

  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return { f0: 0, conf: 0 };

  const x0 = tau > 0 ? cmnd[tau - 1] : cmnd[tau];
  const x1 = cmnd[tau];
  const x2 = tau < halfN - 1 ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (x0 - 2 * x1 + x2);
  const refined = denom !== 0 ? tau + (x0 - x2) / denom : tau;
  return { f0: sampleRate / refined, conf: Math.max(0, Math.min(1, 1 - x1)) };
}

function medianFilter(arr: number[], k = 7): number[] {
  const r = Math.floor(k / 2);
  const out = arr.slice();
  for (let i = 0; i < arr.length; i++) {
    const lo = Math.max(0, i - r);
    const hi = Math.min(arr.length - 1, i + r);
    const win: number[] = [];
    for (let j = lo; j <= hi; j++) if (arr[j] > 0) win.push(arr[j]);
    if (win.length === 0) out[i] = 0;
    else {
      win.sort((a, b) => a - b);
      out[i] = win[win.length >> 1];
    }
  }
  return out;
}

function correctOctaveErrors(f0: number[]): number[] {
  const out = f0.slice();
  const W = 15;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) continue;
    const lo = Math.max(0, i - W);
    const hi = Math.min(out.length - 1, i + W);
    const win: number[] = [];
    for (let j = lo; j <= hi; j++) if (j !== i && out[j] > 0) win.push(out[j]);
    if (win.length < 4) continue;
    win.sort((a, b) => a - b);
    const median = win[win.length >> 1];
    const ratio = out[i] / median;
    if (ratio < 0.6) out[i] = out[i] * 2;
    else if (ratio > 1.6) out[i] = out[i] / 2;
  }
  return out;
}

function emaSmooth(arr: number[], alpha = 0.4): number[] {
  const out = arr.slice();
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) {
      out[i] = 0;
      prev = 0;
    } else if (prev === 0) {
      out[i] = arr[i];
      prev = arr[i];
    } else {
      const sm = alpha * arr[i] + (1 - alpha) * prev;
      out[i] = sm;
      prev = sm;
    }
  }
  return out;
}

function detectOnsets(
  rmss: number[],
  f0: number[],
  hopSec: number,
): number[] {
  if (rmss.length < 4) return [];

  const sm = new Array(rmss.length);
  let s = 0;
  for (let i = 0; i < rmss.length; i++) {
    s = 0.55 * s + 0.45 * rmss[i];
    sm[i] = s;
  }
  let peak = 1e-6;
  for (const v of sm) if (v > peak) peak = v;
  const threshold = peak * 0.18;
  const refractoryFrames = Math.max(4, Math.floor(0.09 / hopSec));
  const energyOnsets: number[] = [];
  let lastEnergyOnset = -refractoryFrames;
  for (let i = 1; i < sm.length - 1; i++) {
    if (i - lastEnergyOnset < refractoryFrames) continue;
    if (sm[i] > threshold && sm[i] > sm[i - 1] * 1.3 && sm[i] >= sm[i + 1]) {
      energyOnsets.push(i);
      lastEnergyOnset = i;
    }
  }

  const pitchOnsets: number[] = [];
  let stablePitch = 0;
  for (let i = 0; i < f0.length; i++) {
    if (f0[i] === 0) continue;
    if (stablePitch === 0) {
      stablePitch = f0[i];
      continue;
    }
    const cents = Math.abs(1200 * Math.log2(f0[i] / stablePitch));
    if (cents > 50) {
      pitchOnsets.push(i);
      stablePitch = f0[i];
    } else {
      stablePitch = stablePitch * 0.7 + f0[i] * 0.3;
    }
  }

  const all = [...energyOnsets, ...pitchOnsets].sort((a, b) => a - b);
  const merged: number[] = [];
  let last = -refractoryFrames;
  for (const idx of all) {
    if (idx - last >= refractoryFrames) {
      merged.push(idx);
      last = idx;
    }
  }
  if (merged.length === 0) {
    const totalDur = rmss.length * hopSec;
    const count = Math.max(3, Math.min(14, Math.round(totalDur / 0.35)));
    for (let i = 0; i < count; i++) {
      merged.push(Math.floor(((i + 0.5) / count) * rmss.length));
    }
  }
  return merged;
}

type ContourShape = "flat" | "rise" | "fall" | "arch" | "dip" | "trill";

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickShape(bird: BirdProfile, rng: () => number): ContourShape {
  if (rng() < bird.warble * 0.4) return "trill";
  if (rng() < 0.85 - bird.warble * 0.35) return "flat";
  const r = rng();
  if (r < 0.3) return "rise";
  if (r < 0.55) return "fall";
  if (r < 0.78) return "arch";
  return "dip";
}

function buildContour(
  shape: ContourShape,
  bird: BirdProfile,
  duration: number,
  anchorPitch: number,
  rng: () => number,
): { t: number; f: number }[] {
  // ── Flat with breathing: held tone but with ±4 cents slow arc drift.
  // Without breathing, the held note sounds like a sustained synth tone.
  // The drift is too small to read as "movement", but big enough to feel
  // alive — same trick a vocalist uses on a held note.
  if (shape === "flat") {
    const breathCentsPeak = 4 * (rng() * 0.6 + 0.7); // 2.8 – 6.4 cents
    const direction = rng() < 0.5 ? 1 : -1;
    const N = 4;
    const pts: { t: number; f: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      // Half-sine arch — peaks mid-syllable, returns near anchor at edges.
      const cents = direction * breathCentsPeak * Math.sin(u * Math.PI);
      const f = anchorPitch * Math.pow(2, cents / 1200);
      pts.push({ t: u * duration, f });
    }
    return pts;
  }

  const center = anchorPitch * (0.97 + rng() * 0.06);
  const span = bird.pitchRange * (0.45 + rng() * 0.55);
  const lo = center - span / 2;
  const hi = center + span / 2;

  const N = 8;
  const pts: { t: number; f: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let f = center;
    switch (shape) {
      case "rise":
        f = lo + (hi - lo) * u;
        break;
      case "fall":
        f = hi - (hi - lo) * u;
        break;
      case "arch":
        f = lo + (hi - lo) * Math.sin(u * Math.PI);
        break;
      case "dip":
        f = hi - (hi - lo) * Math.sin(u * Math.PI);
        break;
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

function appendOrnament(
  contour: { t: number; f: number }[],
  baseDuration: number,
  anchorPitch: number,
): { contour: { t: number; f: number }[]; newDuration: number } {
  const ornDur = 0.045;
  const semitoneRatio = Math.pow(2, 1 / 12);
  const newPts = contour.slice();
  const N = 5;
  for (let k = 1; k <= N; k++) {
    const t = baseDuration + (k / N) * ornDur;
    const f = anchorPitch * (k % 2 === 0 ? 1 : semitoneRatio);
    newPts.push({ t, f });
  }
  return { contour: newPts, newDuration: baseDuration + ornDur };
}

function interpolateContour(
  contour: { t: number; f: number }[],
  tInSyl: number,
): number {
  if (contour.length === 0) return 0;
  if (tInSyl <= contour[0].t) return contour[0].f;
  if (tInSyl >= contour[contour.length - 1].t) return contour[contour.length - 1].f;
  for (let i = 1; i < contour.length; i++) {
    if (contour[i].t >= tInSyl) {
      const a = contour[i - 1];
      const b = contour[i];
      const u = (tInSyl - a.t) / (b.t - a.t);
      return a.f + (b.f - a.f) * u;
    }
  }
  return contour[contour.length - 1].f;
}

/**
 * Magnetism quantisation: pull the input pitch toward the nearest semitone
 * by `magnetism` (0 = no quantisation, 1 = rigid snap). 0.7 leaves enough
 * humanity that singers don't sound auto-tuned, while still pulling the
 * melody onto recognisable notes.
 */
function quantiseToSemitone(hz: number, magnetism = 0.7): number {
  if (hz <= 0) return hz;
  const midi = 12 * Math.log2(hz / 440) + 69;
  const target = Math.round(midi);
  const blended = midi * (1 - magnetism) + target * magnetism;
  return 440 * Math.pow(2, (blended - 69) / 12);
}

function createReverbIR(ctx: BaseAudioContext, durationSec = 1.2): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(1, length, sampleRate);
  const data = impulse.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const env = Math.pow(1 - i / length, 4);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  return impulse;
}

type Syllable = {
  start: number;
  duration: number;
  amplitude: number;
  contour: { t: number; f: number }[];
  isAccented: boolean;
};

export async function translateToBird(
  samples: Float32Array,
  sampleRate: number,
  bird: BirdProfile,
  options: { includeMic?: boolean; micGain?: number } = {},
): Promise<Float32Array> {
  const duration = samples.length / sampleRate;
  if (duration < 0.05) return new Float32Array(0);

  const decimateFactor = sampleRate >= 32000 ? 2 : 1;
  const dec = decimate(samples, decimateFactor);
  const decRate = sampleRate / decimateFactor;
  const frameLen = Math.floor(decRate * 0.04);
  const hop = Math.floor(decRate * 0.01);
  const numFrames = Math.max(1, Math.floor((dec.length - frameLen) / hop) + 1);

  const f0s: number[] = new Array(numFrames).fill(0);
  const rmss: number[] = new Array(numFrames).fill(0);
  let peakRms = 1e-6;

  for (let i = 0; i < numFrames; i++) {
    const off = i * hop;
    const frame = dec.subarray(off, off + frameLen);
    let sumSq = 0;
    for (let s = 0; s < frame.length; s++) sumSq += frame[s] * frame[s];
    const rms = Math.sqrt(sumSq / frame.length);
    rmss[i] = rms;
    if (rms > peakRms) peakRms = rms;
    if (rms < 0.005) continue;
    const { f0, conf } = yinPitch(frame, decRate);
    if (conf > 0.4 && f0 > 80 && f0 < 3500) f0s[i] = f0;
  }

  const f0Med = medianFilter(f0s, 7);
  const f0Corr = correctOctaveErrors(f0Med);
  const f0Smooth = emaSmooth(f0Corr, 0.4);
  const hopSec = hop / decRate;

  const onsets = detectOnsets(rmss, f0Corr, hopSec);
  if (onsets.length === 0) return new Float32Array(0);

  let voicedSum = 0,
    voicedCount = 0;
  for (const f of f0Corr)
    if (f > 0) {
      voicedSum += f;
      voicedCount++;
    }
  const avgF0 = voicedCount >= 3 ? voicedSum / voicedCount : 200;
  const octaveShift = Math.round(Math.log2(bird.baseFreq / avgF0));
  const shiftFactor = Math.pow(2, octaveShift);

  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    iois.push((onsets[i] - onsets[i - 1]) * hopSec);
  }
  const meanIOI =
    iois.length > 0 ? iois.reduce((a, b) => a + b, 0) / iois.length : 0.3;

  const rng = makeRng(onsets.length * 1009 + Math.floor(bird.baseFreq));
  const syllables: Syllable[] = [];

  const MAX_DUR = 0.18;
  const MIN_DUR = 0.06;
  const MIN_SILENCE = 0.04;
  const QUANTISE_MAGNETISM = 0.7;

  for (let i = 0; i < onsets.length; i++) {
    const idx = onsets[i];

    let userPitch = 0;
    for (let d = 0; d < 10 && userPitch === 0; d++) {
      if (idx + d < f0Smooth.length && f0Smooth[idx + d] > 0)
        userPitch = f0Smooth[idx + d];
      else if (idx - d >= 0 && f0Smooth[idx - d] > 0)
        userPitch = f0Smooth[idx - d];
    }
    if (userPitch === 0) userPitch = avgF0;

    const start = idx * hopSec;
    const nextStart =
      i + 1 < onsets.length ? onsets[i + 1] * hopSec : duration;
    const gap = nextStart - start;
    let dur = Math.min(MAX_DUR, Math.max(MIN_DUR, gap - MIN_SILENCE));

    const prevGap = i === 0 ? Infinity : start - onsets[i - 1] * hopSec;
    const isAccented = i === 0 || prevGap > meanIOI * 1.3;
    const isPhraseEnd = i === onsets.length - 1 || gap > meanIOI * 1.5;
    const ornamentProb = 0.15 + bird.warble * 0.25;
    const wantOrnament = isPhraseEnd && dur > 0.10 && rng() < ornamentProb;

    // Detune ±9 cents — wider than ±6 so adjacent same-note syllables drift
    // audibly enough to feel human.
    const detuneCents = (rng() - 0.5) * 18;
    const detuneRatio = Math.pow(2, detuneCents / 1200);

    const transposed = userPitch * shiftFactor;
    const quantised = quantiseToSemitone(transposed, QUANTISE_MAGNETISM);
    const anchorPitch = Math.min(
      4500,
      Math.max(800, quantised * detuneRatio),
    );

    const shape = pickShape(bird, rng);
    let contour = buildContour(shape, bird, dur, anchorPitch, rng);

    if (wantOrnament) {
      const orn = appendOrnament(contour, dur, anchorPitch);
      contour = orn.contour;
      dur = orn.newDuration;
    }

    const amplitudeBase = Math.min(1, rmss[idx] / peakRms + 0.15);
    const amplitude = isAccented ? Math.min(1, amplitudeBase * 1.25) : amplitudeBase;

    syllables.push({ start, duration: dur, amplitude, contour, isAccented });
  }

  const reverbTail = 1.4;
  const totalLen = Math.floor((duration + reverbTail) * sampleRate);
  const offline = new OfflineAudioContext(1, totalLen, sampleRate);

  let sourceBuffer: AudioBuffer;
  try {
    const ab = await getSourceArrayBuffer();
    sourceBuffer = await offline.decodeAudioData(ab);
  } catch (_e) {
    return new Float32Array(0);
  }

  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 3;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.08;

  const master = offline.createGain();
  master.gain.value = 0.55;
  master.connect(offline.destination);
  limiter.connect(master);

  const convolver = offline.createConvolver();
  convolver.buffer = createReverbIR(offline, 1.2);
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.28;
  limiter.connect(convolver).connect(reverbGain).connect(master);

  const highpass = offline.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 600;
  const formant = offline.createBiquadFilter();
  formant.type = "peaking";
  formant.frequency.value = bird.formantFreq;
  formant.Q.value = bird.formantQ;
  formant.gain.value = 7;
  const lowpass = offline.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7000;
  highpass.connect(formant).connect(lowpass).connect(limiter);

  const noiseBuf = offline.createBuffer(1, Math.floor(0.08 * sampleRate), sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  const sourceUsableLen = Math.max(0.05, sourceBuffer.duration - 0.1);
  const GRAIN_SIZE = 0.05;
  const GRAIN_HOP = 0.018;

  for (const syl of syllables) {
    const sylEnv = offline.createGain();
    sylEnv.connect(highpass);

    // Exponential ramps, fast but vocal — no derivative-step click on the
    // amplitude. Attack 5 ms (3 ms when accented), release 10 ms.
    const baseAttack = 0.005;
    const attack = syl.isAccented ? 0.003 : baseAttack;
    const release = 0.010;

    const peak = Math.min(0.6, 0.18 + syl.amplitude * 0.55) *
      (0.7 + 0.4 * Math.min(1, 0.18 / syl.duration));
    sylEnv.gain.setValueAtTime(0.0001, syl.start);
    sylEnv.gain.exponentialRampToValueAtTime(peak, syl.start + attack);
    sylEnv.gain.setValueAtTime(
      peak,
      syl.start + Math.max(attack, syl.duration - release),
    );
    sylEnv.gain.exponentialRampToValueAtTime(0.0001, syl.start + syl.duration);

    const numGrains = Math.max(2, Math.ceil(syl.duration / GRAIN_HOP) + 1);
    let sourcePos = (syl.start * 0.37) % sourceUsableLen;
    for (let g = 0; g < numGrains; g++) {
      const tInSyl = g * GRAIN_HOP;
      if (tInSyl > syl.duration + GRAIN_SIZE) break;

      const u = Math.min(1, tInSyl / Math.max(0.001, syl.duration));
      const contourPitch = interpolateContour(syl.contour, u * syl.duration);
      const playbackRate = Math.min(4.0, Math.max(0.4, contourPitch / SOURCE_PITCH));

      const tAbs = syl.start + tInSyl;
      const grain = offline.createBufferSource();
      grain.buffer = sourceBuffer;
      grain.playbackRate.value = playbackRate;

      const grainGain = offline.createGain();
      grainGain.gain.setValueAtTime(0.0001, tAbs);
      grainGain.gain.linearRampToValueAtTime(1, tAbs + GRAIN_SIZE / 2);
      grainGain.gain.linearRampToValueAtTime(0.0001, tAbs + GRAIN_SIZE);

      grain.connect(grainGain).connect(sylEnv);
      grain.start(tAbs, sourcePos, GRAIN_SIZE * playbackRate + 0.01);
      sourcePos = (sourcePos + 0.014) % sourceUsableLen;
    }

    const noiseSrc = offline.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseBp = offline.createBiquadFilter();
    noiseBp.type = "bandpass";
    noiseBp.frequency.value = 5500;
    noiseBp.Q.value = 1.6;
    const noiseGain = offline.createGain();
    const transientPeak =
      0.18 * bird.attackHardness * syl.amplitude * (syl.isAccented ? 1.4 : 1);
    noiseGain.gain.setValueAtTime(0, syl.start);
    noiseGain.gain.linearRampToValueAtTime(transientPeak, syl.start + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, syl.start + 0.025);
    noiseSrc.connect(noiseBp).connect(noiseGain).connect(limiter);
    noiseSrc.start(syl.start);
    noiseSrc.stop(syl.start + 0.06);
  }

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
