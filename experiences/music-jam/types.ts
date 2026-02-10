// ── Types ────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Constants ────────────────────────────────────────────────────────────────

export const STEP_COUNT = 16;
export const INSTRUMENT_COUNT = 8;

export const INSTRUMENTS = [
  "kick", "snare", "hihat", "clap",
  "bass", "synth", "pad", "fx",
] as const;

export type InstrumentName = typeof INSTRUMENTS[number];

export const INSTRUMENT_COLORS: Record<InstrumentName, string> = {
  kick:  "#ef4444",
  snare: "#f97316",
  hihat: "#eab308",
  clap:  "#22c55e",
  bass:  "#06b6d4",
  synth: "#6366f1",
  pad:   "#8b5cf6",
  fx:    "#ec4899",
};

export const KEYS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const SCALES = ["major", "minor", "pentatonic"] as const;

export type Key = typeof KEYS[number];
export type Scale = typeof SCALES[number];

// ── Step ─────────────────────────────────────────────────────────────────────

export type Step = {
  active: boolean;
  velocity: number;  // 0-1
  color: string;     // hex color override (defaults to instrument color)
};

// ── Track ────────────────────────────────────────────────────────────────────

export type Track = {
  name: string;
  instrument: InstrumentName;
  color: string;
  pattern: Step[];
  volume: number;    // 0-1
  muted: boolean;
};

// ── SequencerState ───────────────────────────────────────────────────────────

export type SequencerState = {
  tracks: Track[];
  bpm: number;
  swing: number;     // 0-1
  key: Key;
  scale: Scale;
  playhead: number;  // 0-15, current step index
  playing: boolean;
  _chat: any[];
  _bugReports: any[];
};

// ── Zod Schema ───────────────────────────────────────────────────────────────

const stepSchema = z.object({
  active: z.boolean().default(false),
  velocity: z.number().min(0).max(1).default(0.8),
  color: z.string().default(""),
});

const trackSchema = z.object({
  name: z.string(),
  instrument: z.enum(INSTRUMENTS),
  color: z.string(),
  pattern: z.array(stepSchema).length(STEP_COUNT),
  volume: z.number().min(0).max(1).default(0.8),
  muted: z.boolean().default(false),
});

export const stateSchema = z.object({
  tracks: z.array(trackSchema).length(INSTRUMENT_COUNT),
  bpm: z.number().min(60).max(200).default(120),
  swing: z.number().min(0).max(1).default(0),
  key: z.enum(KEYS).default("C"),
  scale: z.enum(SCALES).default("major"),
  playhead: z.number().min(0).max(15).default(0),
  playing: z.boolean().default(true),
  _chat: z.array(z.any()).default([]),
  _bugReports: z.array(z.any()).default([]),
});

// ── Initial State Factory ────────────────────────────────────────────────────

function emptyPattern(): Step[] {
  return Array.from({ length: STEP_COUNT }, () => ({
    active: false,
    velocity: 0.8,
    color: "",
  }));
}

export function createInitialState(): SequencerState {
  return {
    tracks: INSTRUMENTS.map((inst) => ({
      name: inst.charAt(0).toUpperCase() + inst.slice(1),
      instrument: inst,
      color: INSTRUMENT_COLORS[inst],
      pattern: emptyPattern(),
      volume: 0.8,
      muted: false,
    })),
    bpm: 120,
    swing: 0,
    key: "C",
    scale: "major",
    playhead: 0,
    playing: true,
    _chat: [],
    _bugReports: [],
  };
}
