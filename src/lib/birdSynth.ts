// Brazilian-bird-inspired whistle synthesizer — melody-follower edition.
//
// Goal: when the user sings or whistles a melody, output that same melody as
// if a bird were whistling it. Two pieces:
//
//   1. YIN-based pitch tracker estimates the F0 contour of the recording.
//      We decimate the signal to ~11 kHz first so the O(N²) inner loop is
//      cheap enough to run on every frame.
//   2. Renderer transposes the contour up an integer number of octaves so
//      the average voice pitch lands near the bird's characteristic register,
//      then plays a sine + small 2nd harmonic through a bandpass shaped on
//      the bird, with light vibrato. Voiced/unvoiced gating gates the gain
//      so silences stay silent and consonants don't whistle.

export type BirdProfile = {
  name: string;
  emoji: string;
  baseFreq: number; // bandpass center & target average pitch after octave shift
  pitchRange: number; // legacy field (unused in melody mode, kept for compat)
  trill: number; // vibrato rate (Hz)
  warble: number; // vibrato depth scale (0..1 → ±0..30 Hz)
  description: string;
};

export const BIRDS: Record<string, BirdProfile> = {
  sabia: {
    name: "Sabiá-laranjeira",
    emoji: "🧡",
    baseFreq: 2200,
    pitchRange: 700,
    trill: 5.5,
    warble: 0.35,
    description: "Brazil's national bird. Melodic, flute-like phrases.",
  },
  bemtevi: {
    name: "Bem-te-vi",
    emoji: "💛",
    baseFreq: 2600,
    pitchRange: 1100,
    trill: 4.5,
    warble: 0.5,
    description: "The classic three-note jungle shout.",
  },
  uirapuru: {
    name: "Uirapuru",
    emoji: "✨",
    baseFreq: 2900,
    pitchRange: 1300,
    trill: 7.5,
    warble: 0.7,
    description: "Mythical Amazon songbird, intricate trills.",
  },
  sanhacu: {
    name: "Sanhaçu",
    emoji: "💙",
    baseFreq: 3300,
    pitchRange: 800,
    trill: 6.5,
    warble: 0.5,
    description: "Bright, chirpy garden whistler.",
  },
};

// ────────────────────────────────────────────────────────────────────────────
// MicRecorder — unchanged from previous version.
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Pitch tracking.
// ────────────────────────────────────────────────────────────────────────────

/** Box-filter decimation. Good enough for pitch detection (we only care about
 *  fundamentals up to ~500Hz, so anti-aliasing above ~5 kHz is sufficient). */
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

/**
 * YIN pitch detector (de Cheveigné & Kawahara 2002), simplified.
 * Returns f0 in Hz and a 0..1 confidence.
 *
 * `frame` is expected to be at least `2 * (sampleRate / minFreq)` samples,
 * i.e. at least two periods of the lowest pitch we care about.
 */
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
  // Cumulative mean normalized difference function.
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
      // Walk to the local minimum.
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return { f0: 0, conf: 0 };

  // Parabolic interpolation around the chosen minimum for sub-sample accuracy.
  const x0 = tau > 0 ? cmnd[tau - 1] : cmnd[tau];
  const x1 = cmnd[tau];
  const x2 = tau < halfN - 1 ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (x0 - 2 * x1 + x2);
  const refined = denom !== 0 ? tau + (x0 - x2) / denom : tau;
  return { f0: sampleRate / refined, conf: Math.max(0, Math.min(1, 1 - x1)) };
}

/** Median filter over a 1D array, ignoring 0 (= unvoiced) values. */
function medianFilter(arr: number[], k = 5): number[] {
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

// ────────────────────────────────────────────────────────────────────────────
// Render.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe a recorded melody into bird whistle.
 */
export async function translateToBird(
  samples: Float32Array,
  sampleRate: number,
  bird: BirdProfile,
  options: { includeMic?: boolean; micGain?: number } = {},
): Promise<Float32Array> {
  const duration = samples.length / sampleRate;
  if (duration < 0.05) return new Float32Array(0);

  // 1) Pitch tracking on a decimated copy of the audio (faster, plenty of
  //    accuracy for vocal F0).
  const decimateFactor = sampleRate >= 32000 ? 4 : 2;
  const dec = decimate(samples, decimateFactor);
  const decRate = sampleRate / decimateFactor;
  const frameLen = Math.floor(decRate * 0.04); // 40 ms
  const hop = Math.floor(decRate * 0.01); // 10 ms
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

  // 2) Median filter to suppress octave-jump errors.
  const f0Smooth = medianFilter(f0s, 5);

  // 3) Pick octave shift so the average user pitch lands near bird.baseFreq.
  let voicedSum = 0,
    voicedCount = 0;
  for (const f of f0Smooth)
    if (f > 0) {
      voicedSum += f;
      voicedCount++;
    }

  if (voicedCount < 3) {
    // No melody detected. Output a short polite chirp at the bird's pitch
    // instead of silence so the user knows something happened.
    return makeSilenceChirp(sampleRate, bird);
  }

  const avgF0 = voicedSum / voicedCount;
  const octaveShift = Math.round(Math.log2(bird.baseFreq / avgF0));
  const shiftFactor = Math.pow(2, octaveShift);

  // 4) Offline render.
  const tail = 0.25;
  const totalLen = Math.floor((duration + tail) * sampleRate);
  const offline = new OfflineAudioContext(1, totalLen, sampleRate);

  // Bandpass shaped on the bird's central frequency — the timbre signature.
  const bandpass = offline.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = bird.baseFreq;
  bandpass.Q.value = 1.4;

  const highshelf = offline.createBiquadFilter();
  highshelf.type = "highshelf";
  highshelf.frequency.value = 6000;
  highshelf.gain.value = -10;

  const master = offline.createGain();
  master.gain.value = 0.95;
  bandpass.connect(highshelf).connect(master).connect(offline.destination);

  const osc = offline.createOscillator();
  osc.type = "sine";
  const osc2 = offline.createOscillator();
  osc2.type = "sine";
  const osc2Gain = offline.createGain();
  osc2Gain.gain.value = 0.13;

  // Light vibrato — gives the "bird" character vs a plain whistle.
  const lfo = offline.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = bird.trill;
  const lfoDepth = offline.createGain();
  lfoDepth.gain.value = bird.warble * 25; // Hz
  lfo.connect(lfoDepth);
  lfoDepth.connect(osc.frequency);
  // Apply same vibrato (scaled) to the second harmonic so they stay locked.
  const lfoDepth2 = offline.createGain();
  lfoDepth2.gain.value = bird.warble * 50;
  lfo.connect(lfoDepth2);
  lfoDepth2.connect(osc2.frequency);

  const env = offline.createGain();
  env.gain.setValueAtTime(0, 0);

  osc.connect(env);
  osc2.connect(osc2Gain).connect(env);
  env.connect(bandpass);

  // Initial pitch — set at t=0 so the first ramp has a known starting point.
  osc.frequency.setValueAtTime(bird.baseFreq, 0);
  osc2.frequency.setValueAtTime(bird.baseFreq * 2, 0);

  // Schedule pitch + gain frame-by-frame, gating on voiced/unvoiced.
  const hopSec = hop / decRate;
  for (let i = 0; i < numFrames; i++) {
    const t = i * hopSec;
    const f = f0Smooth[i];
    if (f > 0) {
      const birdF = Math.min(5500, Math.max(800, f * shiftFactor));
      osc.frequency.linearRampToValueAtTime(birdF, t + hopSec);
      osc2.frequency.linearRampToValueAtTime(birdF * 2, t + hopSec);
      const targetGain = Math.min(0.45, (rmss[i] / peakRms) * 0.55);
      env.gain.linearRampToValueAtTime(targetGain, t + hopSec);
    } else {
      // Unvoiced — fade gain down over the frame so silences are silent.
      env.gain.linearRampToValueAtTime(0, t + hopSec);
    }
  }

  // Final fade.
  env.gain.linearRampToValueAtTime(0, duration + 0.05);

  osc.start(0);
  osc2.start(0);
  lfo.start(0);
  const stopAt = duration + tail;
  osc.stop(stopAt);
  osc2.stop(stopAt);
  lfo.stop(stopAt);

  // Optional: mix the original mic in so user hears the duet.
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

/** Polite default chirp when no melody is detectable in the recording. */
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

/** Play a Float32Array sample buffer through an AudioContext. */
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
