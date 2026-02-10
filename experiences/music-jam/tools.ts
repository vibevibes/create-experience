import { z } from "zod";
import {
  defineTool,
  quickTool,
  createChatTools,
  createBugReportTools,
} from "@vibevibes/sdk";
import { INSTRUMENTS, KEYS, SCALES, STEP_COUNT, INSTRUMENT_COLORS } from "./types";
import type { Track, Step, SequencerState } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function cloneTrack(track: Track): Track {
  return {
    ...track,
    pattern: track.pattern.map((s) => ({ ...s })),
  };
}

function cloneTracks(state: any): Track[] {
  return (state.tracks as Track[]).map(cloneTrack);
}

// ── Tools ────────────────────────────────────────────────────────────────────

export const tools = [
  ...createChatTools(z),
  ...createBugReportTools(z),

  // ── seq.toggle ─────────────────────────────────────────────
  defineTool({
    name: "seq.toggle",
    description: `Toggle a step on/off in the sequencer grid.
Optionally set velocity (0-1) and color override.
trackIndex: 0-7 (kick=0, snare=1, hihat=2, clap=3, bass=4, synth=5, pad=6, fx=7)
stepIndex: 0-15 (16th notes in the bar)`,
    input_schema: z.object({
      trackIndex: z.number().int().min(0).max(7).describe("Track row (0=kick, 7=fx)"),
      stepIndex: z.number().int().min(0).max(15).describe("Step column (0-15)"),
      active: z.boolean().optional().describe("Force on/off (omit to toggle)"),
      velocity: z.number().min(0).max(1).optional().describe("Hit velocity 0-1"),
      color: z.string().optional().describe("Hex color override for this step"),
    }),
    handler: async (ctx: any, input: {
      trackIndex: number;
      stepIndex: number;
      active?: boolean;
      velocity?: number;
      color?: string;
    }) => {
      const tracks = cloneTracks(ctx.state);
      const step = tracks[input.trackIndex].pattern[input.stepIndex];
      const wasActive = step.active;
      step.active = input.active ?? !step.active;
      if (input.velocity !== undefined) step.velocity = input.velocity;
      if (input.color !== undefined) step.color = input.color;
      ctx.setState({ ...ctx.state, tracks });
      return {
        trackIndex: input.trackIndex,
        stepIndex: input.stepIndex,
        active: step.active,
        toggled: wasActive !== step.active,
      };
    },
  }),

  // ── seq.set_track ──────────────────────────────────────────
  defineTool({
    name: "seq.set_track",
    description: `Set an entire track's pattern at once. Pass a 16-element boolean array for the pattern.
Useful for the AI to write full drum patterns, fills, or variations in one call.`,
    input_schema: z.object({
      trackIndex: z.number().int().min(0).max(7).describe("Track row index"),
      pattern: z.array(z.boolean()).length(16).describe("16-step pattern as booleans"),
      velocity: z.number().min(0).max(1).optional().describe("Uniform velocity for all active steps"),
      name: z.string().optional().describe("Rename the track"),
      color: z.string().optional().describe("Track color override"),
    }),
    handler: async (ctx: any, input: {
      trackIndex: number;
      pattern: boolean[];
      velocity?: number;
      name?: string;
      color?: string;
    }) => {
      const tracks = cloneTracks(ctx.state);
      const track = tracks[input.trackIndex];
      const vel = input.velocity ?? 0.8;
      track.pattern = input.pattern.map((active) => ({
        active,
        velocity: vel,
        color: "",
      }));
      if (input.name) track.name = input.name;
      if (input.color) track.color = input.color;
      ctx.setState({ ...ctx.state, tracks });
      const activeCount = input.pattern.filter(Boolean).length;
      return { trackIndex: input.trackIndex, activeSteps: activeCount };
    },
  }),

  // ── seq.set_bpm ────────────────────────────────────────────
  quickTool(
    "seq.set_bpm",
    "Set the tempo in BPM (60-200)",
    z.object({
      bpm: z.number().min(60).max(200).describe("Beats per minute"),
    }),
    async (ctx: any, input: { bpm: number }) => {
      ctx.setState({ ...ctx.state, bpm: input.bpm });
      return { bpm: input.bpm };
    },
  ),

  // ── seq.set_key ────────────────────────────────────────────
  quickTool(
    "seq.set_key",
    "Set the musical key and scale",
    z.object({
      key: z.enum(KEYS).optional().describe("Musical key (C-B)"),
      scale: z.enum(SCALES).optional().describe("Scale type"),
    }),
    async (ctx: any, input: { key?: string; scale?: string }) => {
      const updates: Record<string, any> = {};
      if (input.key) updates.key = input.key;
      if (input.scale) updates.scale = input.scale;
      ctx.setState({ ...ctx.state, ...updates });
      return { key: input.key ?? ctx.state.key, scale: input.scale ?? ctx.state.scale };
    },
  ),

  // ── seq.clear_track ────────────────────────────────────────
  quickTool(
    "seq.clear_track",
    "Clear all steps in a track (set all to inactive)",
    z.object({
      trackIndex: z.number().int().min(0).max(7).describe("Track to clear"),
    }),
    async (ctx: any, input: { trackIndex: number }) => {
      const tracks = cloneTracks(ctx.state);
      tracks[input.trackIndex].pattern.forEach((s) => { s.active = false; });
      ctx.setState({ ...ctx.state, tracks });
      return { trackIndex: input.trackIndex, cleared: true };
    },
  ),

  // ── seq.randomize ──────────────────────────────────────────
  defineTool({
    name: "seq.randomize",
    description: `Randomize a track's pattern with a given density (0-1).
density=0.25 means roughly 25% of steps will be active.
Great for generating experimental beats and happy accidents.`,
    input_schema: z.object({
      trackIndex: z.number().int().min(0).max(7).describe("Track to randomize"),
      density: z.number().min(0).max(1).default(0.3).describe("Probability each step is active"),
      velocityRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
        .optional()
        .describe("Min/max velocity range, e.g. [0.5, 1.0]"),
    }),
    handler: async (ctx: any, input: {
      trackIndex: number;
      density: number;
      velocityRange?: [number, number];
    }) => {
      const tracks = cloneTracks(ctx.state);
      const [vMin, vMax] = input.velocityRange ?? [0.6, 1.0];
      let activeCount = 0;
      tracks[input.trackIndex].pattern = tracks[input.trackIndex].pattern.map(() => {
        const active = Math.random() < input.density;
        if (active) activeCount++;
        return {
          active,
          velocity: active ? vMin + Math.random() * (vMax - vMin) : 0.8,
          color: "",
        };
      });
      ctx.setState({ ...ctx.state, tracks });
      return { trackIndex: input.trackIndex, activeSteps: activeCount };
    },
  }),

  // ── seq.mute ───────────────────────────────────────────────
  quickTool(
    "seq.mute",
    "Toggle mute on a track",
    z.object({
      trackIndex: z.number().int().min(0).max(7).describe("Track to mute/unmute"),
      muted: z.boolean().optional().describe("Force muted state (omit to toggle)"),
    }),
    async (ctx: any, input: { trackIndex: number; muted?: boolean }) => {
      const tracks = cloneTracks(ctx.state);
      tracks[input.trackIndex].muted = input.muted ?? !tracks[input.trackIndex].muted;
      ctx.setState({ ...ctx.state, tracks });
      return {
        trackIndex: input.trackIndex,
        muted: tracks[input.trackIndex].muted,
      };
    },
  ),

  // ── seq.set_volume ─────────────────────────────────────────
  quickTool(
    "seq.set_volume",
    "Set a track's volume (0-1)",
    z.object({
      trackIndex: z.number().int().min(0).max(7).describe("Track index"),
      volume: z.number().min(0).max(1).describe("Volume level"),
    }),
    async (ctx: any, input: { trackIndex: number; volume: number }) => {
      const tracks = cloneTracks(ctx.state);
      tracks[input.trackIndex].volume = input.volume;
      ctx.setState({ ...ctx.state, tracks });
      return { trackIndex: input.trackIndex, volume: input.volume };
    },
  ),

  // ── seq.set_swing ──────────────────────────────────────────
  quickTool(
    "seq.set_swing",
    "Set the global swing amount (0=straight, 1=full shuffle)",
    z.object({
      swing: z.number().min(0).max(1).describe("Swing amount"),
    }),
    async (ctx: any, input: { swing: number }) => {
      ctx.setState({ ...ctx.state, swing: input.swing });
      return { swing: input.swing };
    },
  ),

  // ── seq.play_pause ─────────────────────────────────────────
  quickTool(
    "seq.play_pause",
    "Toggle playback of the visual playhead",
    z.object({
      playing: z.boolean().optional().describe("Force play/pause (omit to toggle)"),
    }),
    async (ctx: any, input: { playing?: boolean }) => {
      const playing = input.playing ?? !ctx.state.playing;
      ctx.setState({ ...ctx.state, playing });
      return { playing };
    },
  ),
];
