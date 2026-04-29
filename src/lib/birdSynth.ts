// Brazilian-bird-inspired whistle synthesizer — melody-follower edition,
// calibrated against real human-whistle recordings, with breath noise +
// synthetic reverb to add the organic / spatial feel that pure-synth
// whistles lack.
//
// Targets measured from 18 reference whistles:
//   - F0 around 1500 Hz (typical 1200-1800)
//   - Vibrato rate ~3 Hz, depth ~80-150 Hz peak
//   - Essentially zero harmonic content (pure sine)
//
// Signal chain:
//   oscillator (sine, slow vibrato + noise pitch jitter)
//      ↓ summed with breath noise (bandpass-filtered, gated by envelope)
//   envelope (per-frame, follows voiced/unvoiced)
//      ↓
//   limiter (safety)
//      ↓ ┐ dry path (direct)
//        └ wet path → ConvolverNode (synthetic IR, ~1.2 s decay)
//      ↓ both summed at master gain → output

export type BirdProfile = {
  name: string;
  accent: string;
  baseFreq: number;
  pitchRange: number;
  trill: number;
  warble: number;
  description: string;
};

export const BIRDS: Record<string, BirdProfile> = {
  bemtevi: {
    name: "Bem-te-vi",
    accent: "#F2C94C",
    baseFreq: 1900,
    pitchRange: 700,
    trill: 3.2,
    warble: 0.9,
    description: "O guardião da manhã, canto claro que abre o dia na natureza.",
  },
  sabia: {
    name: "Sabiá-laranjeira",
    accent: "#E67E22",
    baseFreq: 1600,
    pitchRange: 500,
    trill: 2.8,
    warble: 0.7,
    description: "Poeta da paisagem, seu canto é memória e tradição.",
  },
  uirapuru: {
    name: "Uirapuru",
    accent: "#E74C3C",
    baseFreq: 2100,
    pitchRange: 800,
    trill: 4.0,
    warble: 1.0,
    description: "Raro e misterioso, seu canto ecoa como encantamento da mata.",
  },
  azulao: {
    name: "Azulão",
    accent: "#2D7DD2",
    baseFreq: 1800,
    pitchRange: 400,
    trill: 2.5,
    warble: 0.6,
    description: "Força e beleza, seu canto é firme e marcante.",
  },
  tiesangue: {
    name: "Tiê-sangue",
    accent: "#6BAF6B",
    baseFreq: 2200,
    pitchRange: 500,
    trill: 3.5,
    warble: 0.85,
    description: "Pequeno notável, seu canto é alegria que contagia.",
  },
  sanhacu: {
    name: "Sanhaçu",
    accent: "#A48DBA",
    baseFreq: 2300,
    pitchRange: 500,
    trill: 3.4,
    warble: 0.8,
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

/**
 * Low-passed white noise buffer used to modulate the oscillator's pitch.
 * Gives the irregular wobble that human breath/lip variation produces.
 */
function makeNoiseModBuffer(ctx: OfflineAudioContext, durationSec: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  // 1-pole low-pass (~6 Hz cutoff).
  const dt = 1 / ctx.sampleRate;
  const fc = 6;
  const rc = 1 / (2 * Math.PI * fc);
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    prev = prev + alpha * (data[i] - prev);
    data[i] = prev;
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
  for (let i = 0; i < n; i++) data[i] /= peak;
  return buf;
}

/**
 * Generate a synthetic monaural impulse response for a small "outdoor"
 * reverb. Decaying coloured noise — fast initial decay, longer tail.
 * Used by the ConvolverNode to give the dry whistle a sense of being
 * recorded in a real space.
 */
function createReverbIR(ctx: BaseAudioContext, durationSec = 1.2): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(1, length, sampleRate);
  const data = impulse.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Exponentially-decaying noise. The (1 - i/length)^4 envelope gives a
    // dense early reflection followed by a long, soft tail.
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

  if (voicedCount < 3) return makeSilenceChirp(sampleRate, bird);

  const avgF0 = voicedSum / voicedCount;
  const octaveShift = Math.round(Math.log2(bird.baseFreq / avgF0));
  const shiftFactor = Math.pow(2, octaveShift);

  // Add tail for the reverb decay to fade out naturally.
  const reverbTail = 1.4;
  const totalLen = Math.floor((duration + reverbTail) * sampleRate);
  const offline = new OfflineAudioContext(1, totalLen, sampleRate);

  // Safety limiter at the input of the master bus.
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 3;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.08;

  const master = offline.createGain();
  master.gain.value = 0.45;
  master.connect(offline.destination);

  // Dry path: limiter → master.
  limiter.connect(master);

  // Wet path: limiter → convolver → reverbGain → master. The synthetic IR
  // simulates an open garden / forest with ~1.2 s of decay.
  const convolver = offline.createConvolver();
  convolver.buffer = createReverbIR(offline, 1.2);
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.3;
  limiter.connect(convolver).connect(reverbGain).connect(master);

  // ── Whistle voice ──
  const osc = offline.createOscillator();
  osc.type = "sine";

  // Slow vibrato (~3 Hz), measured profile of real whistles.
  const lfo = offline.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = bird.trill;
  const lfoDepth = offline.createGain();
  lfoDepth.gain.value = bird.warble * 80;
  lfo.connect(lfoDepth);
  lfoDepth.connect(osc.frequency);

  // Filtered-noise pitch jitter — natural breath/lip micro-wobble.
  const noiseModBuf = makeNoiseModBuffer(offline, Math.min(2.0, duration + 0.5));
  const noiseSrc = offline.createBufferSource();
  noiseSrc.buffer = noiseModBuf;
  noiseSrc.loop = true;
  const noiseDepth = offline.createGain();
  noiseDepth.gain.value = bird.warble * 30;
  noiseSrc.connect(noiseDepth);
  noiseDepth.connect(osc.frequency);

  // ── Breath texture ──
  // White noise → bandpass (centred ~3.5 kHz, broad) → small gain → same
  // envelope as the oscillator. This adds the airy texture of a real
  // creature pushing breath through a beak/syringe. Gating through `env`
  // means the breath is only present when the bird is "singing" — no
  // background hiss between phrases.
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
  breathGain.gain.value = 0.06;

  // ── Envelope (shared by oscillator and breath) ──
  const env = offline.createGain();
  env.gain.setValueAtTime(0, 0);

  osc.connect(env);
  breathSrc.connect(breathFilter).connect(breathGain).connect(env);

  env.connect(limiter);

  osc.frequency.setValueAtTime(bird.baseFreq, 0);

  const hopSec = hop / decRate;
  const envTau = 0.025;
  for (let i = 0; i < numFrames; i++) {
    const t = i * hopSec;
    const f = f0Smooth[i];
    if (f > 0) {
      const birdF = Math.min(2900, Math.max(800, f * shiftFactor));
      osc.frequency.linearRampToValueAtTime(birdF, t + hopSec);
      const targetGain = Math.min(0.55, (rmss[i] / peakRms) * 0.7);
      env.gain.setTargetAtTime(targetGain, t, envTau);
    } else {
      env.gain.setTargetAtTime(0, t, envTau * 1.4);
    }
  }
  env.gain.setTargetAtTime(0, duration, 0.04);

  osc.start(0);
  lfo.start(0);
  noiseSrc.start(0);
  breathSrc.start(0);
  const stopAt = duration + 0.2;
  osc.stop(stopAt);
  lfo.stop(stopAt);
  noiseSrc.stop(stopAt);
  breathSrc.stop(stopAt);

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

function makeSilenceChirp(sampleRate: number, bird: BirdProfile): Float32Array {
  const dur = 0.35;
  const out = new Float32Array(Math.floor(sampleRate * dur));
  const f1 = bird.baseFreq;
  const f2 = bird.baseFreq * 1.25;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const u = t / dur;
    const freq = f1 + (f2 - f1) * u;
    const env = Math.exp(-Math.pow((u - 0.15) * 4, 2));
    out[i] = Math.sin(2 * Math.PI * freq * t) * 0.35 * env;
  }
  return out;
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
