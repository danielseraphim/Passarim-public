// Brazilian-bird-inspired whistle synthesizer — melody-follower edition.
//
// Pipeline:
//   1. Decimate audio (×4 from 44.1 kHz → ~11 kHz) so the O(N²) YIN inner
//      loop is cheap on every frame.
//   2. Frame-by-frame YIN pitch detection (40 ms frames, 10 ms hop), with a
//      median filter to suppress octave-jump errors.
//   3. Compute the user's mean F0 over voiced frames and choose an integer
//      octave shift so the melody lands near the chosen bird's central pitch.
//   4. Render with a single oscillator using a PeriodicWave (sine + small 2nd
//      harmonic, phase-locked), light vibrato, bandpass shaped on the bird's
//      central frequency, and a brick-wall limiter to keep MP3 encoding clean.

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
    baseFreq: 2600,
    pitchRange: 1100,
    trill: 4.5,
    warble: 0.5,
    description: "O guardião da manhã, canto claro que abre o dia na natureza.",
  },
  sabia: {
    name: "Sabiá-laranjeira",
    accent: "#E67E22",
    baseFreq: 2200,
    pitchRange: 700,
    trill: 5.5,
    warble: 0.35,
    description: "Poeta da paisagem, seu canto é memória e tradição.",
  },
  uirapuru: {
    name: "Uirapuru",
    accent: "#E74C3C",
    baseFreq: 2900,
    pitchRange: 1300,
    trill: 7.5,
    warble: 0.7,
    description: "Raro e misterioso, seu canto ecoa como encantamento da mata.",
  },
  azulao: {
    name: "Azulão",
    accent: "#2D7DD2",
    baseFreq: 2500,
    pitchRange: 600,
    trill: 4,
    warble: 0.3,
    description: "Força e beleza, seu canto é firme e marcante.",
  },
  tiesangue: {
    name: "Tiê-sangue",
    accent: "#6BAF6B",
    baseFreq: 3100,
    pitchRange: 700,
    trill: 6,
    warble: 0.5,
    description: "Pequeno notável, seu canto é alegria que contagia.",
  },
  sanhacu: {
    name: "Sanhaçu",
    accent: "#A48DBA",
    baseFreq: 3300,
    pitchRange: 800,
    trill: 6.5,
    warble: 0.5,
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

  const f0Smooth = medianFilter(f0s, 5);

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

  const tail = 0.25;
  const totalLen = Math.floor((duration + tail) * sampleRate);
  const offline = new OfflineAudioContext(1, totalLen, sampleRate);

  // Bandpass shapes the timbre on the bird's central frequency. Q=1.2 keeps
  // a clear "whistle" character without ringing on transients.
  const bandpass = offline.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = bird.baseFreq;
  bandpass.Q.value = 1.2;

  // Roll off harshness above 6 kHz a touch.
  const highshelf = offline.createBiquadFilter();
  highshelf.type = "highshelf";
  highshelf.frequency.value = 6000;
  highshelf.gain.value = -8;

  // Brick-wall-ish limiter: prevents the bandpass resonance + envelope from
  // ever pushing the signal above 0 dBFS. Without this we get harsh hash
  // when the MP3 encoder hits clipped samples.
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const master = offline.createGain();
  master.gain.value = 0.55;

  bandpass
    .connect(highshelf)
    .connect(limiter)
    .connect(master)
    .connect(offline.destination);

  // Single oscillator with sine + small 2nd harmonic baked into a PeriodicWave.
  // This keeps the harmonic phase-locked to the fundamental — vibrato/glide
  // shifts both together with no inter-oscillator beating.
  const real = new Float32Array([0, 1, 0.12]);
  const imag = new Float32Array([0, 0, 0]);
  const wave = offline.createPeriodicWave(real, imag, {
    disableNormalization: true,
  });
  const osc = offline.createOscillator();
  osc.setPeriodicWave(wave);

  // Vibrato.
  const lfo = offline.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = bird.trill;
  const lfoDepth = offline.createGain();
  lfoDepth.gain.value = bird.warble * 18;
  lfo.connect(lfoDepth);
  lfoDepth.connect(osc.frequency);

  const env = offline.createGain();
  env.gain.setValueAtTime(0, 0);
  osc.connect(env).connect(bandpass);

  osc.frequency.setValueAtTime(bird.baseFreq, 0);

  // Schedule pitch + gain frame-by-frame. Pitch uses linearRamp (smooth
  // glide between notes); gain uses setTargetAtTime (exponential approach,
  // no zipper noise on rapid voiced↔unvoiced transitions).
  const hopSec = hop / decRate;
  const envTau = 0.022; // ~22 ms
  for (let i = 0; i < numFrames; i++) {
    const t = i * hopSec;
    const f = f0Smooth[i];
    if (f > 0) {
      const birdF = Math.min(5500, Math.max(800, f * shiftFactor));
      osc.frequency.linearRampToValueAtTime(birdF, t + hopSec);
      const targetGain = Math.min(0.4, (rmss[i] / peakRms) * 0.5);
      env.gain.setTargetAtTime(targetGain, t, envTau);
    } else {
      env.gain.setTargetAtTime(0, t, envTau * 1.4);
    }
  }
  env.gain.setTargetAtTime(0, duration, 0.04);

  osc.start(0);
  lfo.start(0);
  const stopAt = duration + tail;
  osc.stop(stopAt);
  lfo.stop(stopAt);

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
