// audio.ts — generative WebAudio. A low evolving drone per era plus chimes
// for clicks, purchases, and phase transitions. No asset files. Mutable.

import type { Phase } from "./state";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let muted = false;
let started = false;
let currentEra: Phase | 0 = 0;

// Frequencies (root chord) per era — descend in brightness as entropy rises.
const ERA_CHORDS: Record<number, number[]> = {
  1: [55, 82.4, 110], // abyssal — A1 / E2 / A2
  2: [65.4, 98, 130.8], // warm — C2 / G2 / C3
  3: [73.4, 110, 146.8, 220], // electric — D2 / A2 / D3 / A3
  4: [49, 73.4, 98, 196], // cosmic — G1 / D2 / G2 / G3
  5: [41.2, 61.7], // heat death — sparse, low
};

function ensureCtx(): boolean {
  if (muted) return false;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
  }
  if (ctx.state === "suspended") ctx.resume();
  return true;
}

/** Call from a user gesture to unlock audio. */
export function startAudio(): void {
  if (started) return;
  if (!ensureCtx() || !ctx || !master) return;
  started = true;
  master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (!ctx || !master) return;
  if (m) {
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
  } else {
    ensureCtx();
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.5);
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Build/replace the drone for an era with a smooth crossfade. */
export function setEra(era: Phase): void {
  if (era === currentEra) return;
  currentEra = era;
  if (!ensureCtx() || !ctx || !master) return;

  // fade out old
  const now = ctx.currentTime;
  for (const n of droneNodes) {
    n.gain.gain.cancelScheduledValues(now);
    n.gain.gain.linearRampToValueAtTime(0, now + 2.5);
    n.osc.stop(now + 3);
  }
  droneNodes = [];

  const chord = ERA_CHORDS[era] ?? ERA_CHORDS[1];
  chord.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    osc.type = i === 0 ? "sine" : era >= 3 ? "triangle" : "sine";
    osc.frequency.value = freq;
    // slow detune wobble via a second LFO-modulated gain handled by phase offsets
    const gain = ctx!.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master!);
    osc.start();
    const target = 0.12 / chord.length;
    gain.gain.linearRampToValueAtTime(target, now + 3 + i * 0.4);
    droneNodes.push({ osc, gain });
  });
}

/** A short pluck/chime. */
function blip(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.15): void {
  if (!ensureCtx() || !ctx || !master) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function sfxClick(): void {
  blip(440 + Math.random() * 60, 0.08, "triangle", 0.08);
}
export function sfxBuy(): void {
  blip(660, 0.1, "sine", 0.12);
  blip(880, 0.14, "sine", 0.08);
}
export function sfxAchieve(): void {
  blip(523, 0.16, "sine", 0.13);
  setTimeout(() => blip(784, 0.2, "sine", 0.11), 90);
}
export function sfxPhase(): void {
  // rising arpeggio sweep
  const notes = [196, 261, 329, 392, 523];
  notes.forEach((n, i) => setTimeout(() => blip(n, 0.35, "triangle", 0.12), i * 110));
}
export function sfxEnding(): void {
  const notes = [392, 329, 261, 196, 130];
  notes.forEach((n, i) => setTimeout(() => blip(n, 0.9, "sine", 0.14), i * 350));
}
