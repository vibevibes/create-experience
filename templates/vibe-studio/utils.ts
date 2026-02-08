// ── Vibe Studio — Music Constants & Helpers ─────────────────────────────

// ── Note System ─────────────────────────────────────────────────────────

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

/** MIDI note 60 = C4 (middle C). Range: C1 (24) to C7 (96). */
export const MIDI_MIN = 24;
export const MIDI_MAX = 96;

export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

export function nameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(\d+)$/);
  if (!match) return 60;
  const noteIdx = NOTE_NAMES.indexOf(match[1] as NoteName);
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIdx;
}

/** Get frequency in Hz for a MIDI note (A4 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Scales ──────────────────────────────────────────────────────────────

export const SCALES: Record<string, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  pentatonic:       [0, 2, 4, 7, 9],
  blues:            [0, 3, 5, 6, 7, 10],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_NAMES = Object.keys(SCALES) as string[];

/** Check if a MIDI note belongs to a scale rooted at `root`. */
export function isInScale(midi: number, root: number, scale: string): boolean {
  const intervals = SCALES[scale] || SCALES.chromatic;
  const degree = ((midi - root) % 12 + 12) % 12;
  return intervals.includes(degree);
}

// ── Instruments / Synth Types ───────────────────────────────────────────

export const INSTRUMENTS = [
  "synth",
  "bass",
  "pad",
  "lead",
  "keys",
  "pluck",
  "drums",
  "strings",
] as const;

export type InstrumentType = (typeof INSTRUMENTS)[number];

/** Colors for each instrument type (for track headers and clips). */
export const INSTRUMENT_COLORS: Record<InstrumentType, string> = {
  synth:   "#6366f1",
  bass:    "#ef4444",
  pad:     "#8b5cf6",
  lead:    "#f59e0b",
  keys:    "#06b6d4",
  pluck:   "#10b981",
  drums:   "#ec4899",
  strings: "#84cc16",
};

export const INSTRUMENT_ICONS: Record<InstrumentType, string> = {
  synth:   "\u{1F3B9}",
  bass:    "\u{1F3B8}",
  pad:     "\u{1F30A}",
  lead:    "\u{2B50}",
  keys:    "\u{1F3B9}",
  pluck:   "\u{1FA95}",
  drums:   "\u{1F941}",
  strings: "\u{1F3BB}",
};

// ── Time ────────────────────────────────────────────────────────────────

/** Beats per bar (4/4 time). */
export const BEATS_PER_BAR = 4;
/** Subdivisions per beat for the grid (16th notes). */
export const SUBDIVISIONS = 4;
/** Steps per bar = 16 (16th notes in 4/4). */
export const STEPS_PER_BAR = BEATS_PER_BAR * SUBDIVISIONS;

/** Convert BPM + step index to seconds. */
export function stepToSeconds(step: number, bpm: number): number {
  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / SUBDIVISIONS;
  return step * secondsPerStep;
}

// ── ID Generator ────────────────────────────────────────────────────────

export function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
