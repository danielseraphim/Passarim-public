// Brazilian-bird-inspired whistle synthesizer — Path B: granular synthesis.
//
// We replaced the sine-oscillator core with granular synthesis fed by a real
// human whistle sample (a 3-second sustained excerpt of one of the user's
// own whistles, served as a static asset at /whistle-source.ogg). The
// source whistle gives the system its ORGANIC TIMBRE — the irregular
// breath, the natural micro-jitter, the harmonic ghost imprints — that no
// amount of sine-wave imperfection-injection could match.
//
// Per-species character is shaped by:
//   1. Octave-shift target (how high each bird "sits" relative to the user)
//   2. A peaking biquad filter (formant-style) at each bird's characteristic
//      resonance frequency, with a Q chosen to match the species' tonal
//      tightness. Parameters are informed by published spectra of these
//      species (rather than literal recordings, since this sandbox can't
//      reach xeno-canto).
//   3. Vibrato rate + depth + attack hardness per species.
//
// Pipeline:
//   1. Decimate audio (×4) and run YIN per frame.
//   2. Median (window 7) + EMA smoothing on the F0 contour.
//   3. Detect onsets (rising-edge peaks in the smoothed RMS envelope).
//   4. Octave-shift to land the average user pitch near each bird's base.
//   5. Apply slow vibrato + per-frame jitter to the pitch contour.
//   6. GRANULAR RENDER: schedule overlapping grains of the source whistle,
//      each played at the per-frame pitch-shifted rate. Hann-windowed,
//      ~80 ms grains, 30 ms hop.
//   7. Per-bird peaking filter for spectral coloration.
//   8. Onset-triggered transient noise + sharp gain bursts for articulation.
//   9. Tremolo (~9.5 Hz AM) for the "alive" feel birds have, theremins don't.
//  10. Dry/wet → master with synthetic mono reverb.

const SOURCE_URL = "/whistle-source.ogg";
const SOURCE_PITCH = 1500; // Hz — measured average F0 of the source clip.

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
  baseFreq: number;       // target avg pitch (Hz)
  pitchRange: number;     // legacy/visual only
  trill: number;          // vibrato rate (Hz)
  warble: number;         // vibrato depth scaler
  formantFreq: number;    // peaking-filter centre (Hz)
  formantQ: number;       // peaking-filter Q
  attackHardness: number; // 0..1 — how percussive each onset is
  description: string;
};

export const BIRDS: Record<string, BirdProfile> = {
  bemtevi: {
    name: "Bem-te-vi",
    accent: "#F2C94C",
    baseFreq: 2400,
    pitchRange: 700,
    trill: 4.0,
    warble: 0.5,
    formantFreq: 2800,
    formantQ: 3.5,
    attackHardness: 0.7,
    description: "O guardião da manhã, canto claro que abre o dia na natureza.",
  },
  sabia: {
    name: "Sabiá-laranjeira",
    accent: "#E67E22",
    baseFreq: 2100,
    pitchRange: 600,
    trill: 3.5,
    warble: 0.6,
    formantFreq: 2400,
    formantQ: 3.0,
    attackHardness: 0.3,
    description: "Poeta da paisagem, seu canto é memória e tradição.",
  },
  uirapuru: {
    name: "Uirapuru",
    accent: "#E74C3C",
    baseFreq: 2500,
    pitchRange: 900,
    trill: 7.0,
    warble: 1.0,
    formantFreq: 2700,
    formantQ: 2.5,
    attackHardness: 0.5,
    description: "Raro e misterioso, seu canto ecoa como encantamento da mata.",
  },
  azulao: {
    name: "Azulão",
    accent: "#2D7DD2",
    baseFreq: 2200,
    pitchRange: 400,
    trill: 2.5,
    warble: 0.3,
    formantFreq: 2200,
    formantQ: 4.5,
    attackHardness: 0.4,
    description: "Força e beleza, seu canto é firme e marcante.",
  },
  tiesangue: {
    name: "Tiê-sangue",
    accent: "#6BAF6B",
    baseFreq: 2800,
    pitchRange: 500,
    trill: 5.0,
    warble: 0.5,
    formantFreq: 3200,
    formantQ: 4.0,
    attackHardness: 0.7,
    description: "Pequeno notável, seu canto é alegria que contagia.",
  },
  sanhacu: {
    name: "Sanhaçu",
    accent: "#A48DBA",
    baseFreq: 3000,
    pitchRange: 500,
    trill: 4.0,
    warble: 0.6,
    formantFreq: 3500,
    formantQ: 3.0,
    attackHardness: 0.6,
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
  threshold = 0.15,
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
  const minLag = Math.max(2, Math.floor(sampleRate / 500));
  const maxLag = Math.min(halfN - 2, Math.floor(sampleRate / 70));
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

function detectOnsets(rmss: number[], hopSec: number): number[] {
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
  const onsets: number[] = [];
  let lastOnset = -refractoryFrames;
  for (let i = 1; i < sm.length - 1; i++) {
    if (i - lastOnset < refractoryFrames) continue;
    if (sm[i] > threshold && sm[i] > sm[i - 1] * 1.3 && sm[i] >= sm[i + 1]) {
      onsets.push(i);
      lastOnset = i;
    }
  }
  return onsets;
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

export async function translateToBird(
  samples: Float32Array,
  sampleRate: number,
  bird: BirdProfile,
  options: { includeMic?: boolean; micGain?: number } = {},
): Promise<Float32Array> {
  const duration = samples.length / sampleRate;
  if (duration < 0.05) return new Float32Array(0);

  // ── Pitch + onset analysis (same as before) ──
  const decimateFactor = sampleRate >= 32000 ? 4 : 2;
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
    if (conf > 0.5 && f0 > 70 && f0 < 600) f0s[i] = f0;
  }

  const f0Med = medianFilter(f0s, 7);
  const f0Smooth = emaSmooth(f0Med, 0.4);

  let voicedSum = 0,
    voicedCount = 0;
  for (const f of f0Smooth)
    if (f > 0) {
      voicedSum += f;
      voicedCount++;
    }
  if (voicedCount < 3) return new Float32Array(0);

  const avgF0 = voicedSum / voicedCount;
  const octaveShift = Math.round(Math.log2(bird.baseFreq / avgF0));
  const shiftFactor = Math.pow(2, octaveShift);

  const hopSec = hop / decRate;
  const onsetFrames = new Set(detectOnsets(rmss, hopSec));

  // Apply slow vibrato + jitter to the pitch contour BEFORE granular shifts.
  // Doing it here instead of via LFO-on-AudioParam keeps each grain's
  // playbackRate self-consistent (no inter-grain phase weirdness).
  const f0Final = f0Smooth.map((f, i) => {
    if (f === 0) return 0;
    const t = i * hopSec;
    const vib = 1 + Math.sin(2 * Math.PI * bird.trill * t) * bird.warble * 0.04;
    const jitter = 1 + (Math.random() - 0.5) * 0.012;
    return f * vib * jitter;
  });

  // ── Render setup ──
  const reverbTail = 1.4;
  const totalLen = Math.floor((duration + reverbTail) * sampleRate);
  const offline = new OfflineAudioContext(1, totalLen, sampleRate);

  // Decode source whistle into this offline context.
  let sourceBuffer: AudioBuffer;
  try {
    const ab = await getSourceArrayBuffer();
    sourceBuffer = await offline.decodeAudioData(ab);
  } catch (_e) {
    // If the source asset isn't reachable for some reason, return silence
    // rather than crashing.
    return new Float32Array(0);
  }

  // Limiter, master, dry/wet reverb (same topology as before).
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
  reverbGain.gain.value = 0.25;
  limiter.connect(convolver).connect(reverbGain).connect(master);

  // Per-bird formant filter + low/high passes (timbre coloration).
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

  // Tremolo gain stage (multiplicative AM).
  const tremoloGain = offline.createGain();
  tremoloGain.gain.value = 1.0;
  const tremolo = offline.createOscillator();
  tremolo.type = "sine";
  tremolo.frequency.value = 9.5;
  const tremoloDepth = offline.createGain();
  tremoloDepth.gain.value = 0.16;
  tremolo.connect(tremoloDepth).connect(tremoloGain.gain);

  // Master envelope (gates voiced/unvoiced + applies onset attack shaping).
  const env = offline.createGain();
  env.gain.setValueAtTime(0, 0);

  // Whistle voice path: grains → highpass → formant → lowpass → env → tremoloGain → limiter
  highpass.connect(formant).connect(lowpass).connect(env);
  env.connect(tremoloGain).connect(limiter);

  // Breath texture (sustained, gated by env).
  const breathBuf = offline.createBuffer(1, totalLen, sampleRate);
  const breathData = breathBuf.getChannelData(0);
  for (let i = 0; i < totalLen; i++) breathData[i] = Math.random() * 2 - 1;
  const breathSrc = offline.createBufferSource();
  breathSrc.buffer = breathBuf;
  const breathFilter = offline.createBiquadFilter();
  breathFilter.type = "bandpass";
  breathFilter.frequency.value = 3500;
  breathFilter.Q.value = 0.5;
  const breathGain = offline.createGain();
  breathGain.gain.value = 0.04;
  breathSrc.connect(breathFilter).connect(breathGain).connect(env);

  // Onset transient noise (re-uses the breath buffer).
  const transientSrc = offline.createBufferSource();
  transientSrc.buffer = breathBuf;
  const transientFilter = offline.createBiquadFilter();
  transientFilter.type = "bandpass";
  transientFilter.frequency.value = 5500;
  transientFilter.Q.value = 1.6;
  const transientGain = offline.createGain();
  transientGain.gain.setValueAtTime(0, 0);
  transientSrc.connect(transientFilter).connect(transientGain).connect(limiter);

  // ── Schedule grains ──
  // Granular params: 80 ms grain, 30 ms hop → 62 % overlap, Hann-windowed.
  const grainSize = 0.08;
  const grainHop = 0.03;
  const sourceUsableLen = Math.max(0.05, sourceBuffer.duration - grainSize - 0.05);
  const numGrains = Math.ceil(duration / grainHop) + 2;
  let sourcePos = 0;
  const sourceCycle = 0.018; // how fast to advance through the source per grain

  // For each grain, look up the corresponding f0Final frame and schedule.
  for (let g = 0; g < numGrains; g++) {
    const tOut = g * grainHop;
    const frameIdx = Math.min(numFrames - 1, Math.max(0, Math.floor(tOut / hopSec)));
    const f = f0Final[frameIdx];
    if (f <= 0) continue; // unvoiced — don't emit a grain

    const targetPitch = Math.min(3500, Math.max(900, f * shiftFactor));
    const playbackRate = targetPitch / SOURCE_PITCH;
    const targetGain = Math.min(0.55, (rmss[frameIdx] / peakRms) * 0.7);

    const grain = offline.createBufferSource();
    grain.buffer = sourceBuffer;
    grain.playbackRate.value = playbackRate;

    const grainGain = offline.createGain();
    // Hann-shaped envelope: 0 → peak (mid) → 0 over grainSize.
    grainGain.gain.setValueAtTime(0.0001, tOut);
    grainGain.gain.linearRampToValueAtTime(targetGain, tOut + grainSize / 2);
    grainGain.gain.linearRampToValueAtTime(0.0001, tOut + grainSize);

    grain.connect(grainGain).connect(highpass);

    const sourceStart = sourcePos % sourceUsableLen;
    grain.start(tOut, sourceStart, grainSize * playbackRate + 0.01);
    sourcePos += sourceCycle;
  }

  // Master envelope from voiced/unvoiced + onset shaping.
  const envTau = 0.024;
  for (let i = 0; i < numFrames; i++) {
    const t = i * hopSec;
    const f = f0Final[i];
    if (f > 0) {
      const targetGain = Math.min(0.95, (rmss[i] / peakRms) * 1.1);
      if (onsetFrames.has(i)) {
        env.gain.cancelScheduledValues(t);
        const overshoot = 1 + bird.attackHardness * 0.25;
        env.gain.setTargetAtTime(targetGain * overshoot, t, 0.004);
        env.gain.setTargetAtTime(targetGain, t + 0.02, 0.03);

        // Noise transient + bandpass burst at onset
        transientGain.gain.setValueAtTime(0, t);
        transientGain.gain.linearRampToValueAtTime(
          0.18 * bird.attackHardness,
          t + 0.003,
        );
        transientGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      } else {
        env.gain.setTargetAtTime(targetGain, t, envTau);
      }
    } else {
      env.gain.setTargetAtTime(0, t, envTau * 1.4);
    }
  }
  env.gain.setTargetAtTime(0, duration, 0.04);

  // Start the always-running sources.
  breathSrc.start(0);
  transientSrc.start(0);
  tremolo.start(0);
  const stopAt = duration + 0.4;
  breathSrc.stop(stopAt);
  transientSrc.stop(stopAt);
  tremolo.stop(stopAt);

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
