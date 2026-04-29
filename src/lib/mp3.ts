// MP3 encoding for the synthesised whistle, so we can share it on WhatsApp
// and it plays inline as audio (WAV gets shown as a document attachment,
// which is bad UX). Uses @breezystack/lamejs — a maintained fork of lamejs
// with TypeScript definitions and modern browser fixes. ~50KB gzipped.

import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Encode a Float32Array PCM buffer into an MP3 Blob.
 *
 * lamejs supports sample rates 8/11.025/12/16/22.05/24/32/44.1/48 kHz. The
 * sample rates we get from getUserMedia (44100 or 48000) are always covered.
 */
export function encodeMP3(
  samples: Float32Array,
  sampleRate: number,
  bitrateKbps = 128,
): Blob {
  // Float32 (-1..1) → Int16 PCM
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, sampleRate, bitrateKbps);
  const blockSize = 1152; // MPEG frame size for sample buffer
  const chunks: Int8Array[] = [];

  for (let i = 0; i < int16.length; i += blockSize) {
    const chunk = int16.subarray(i, Math.min(i + blockSize, int16.length));
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks, { type: "audio/mpeg" });
}
