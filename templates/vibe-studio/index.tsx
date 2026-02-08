// ── Vibe Studio — Collaborative DAW Experience ──────────────────────────
// A collaborative digital audio workstation where humans and AI create
// music together in real-time. Multiple humans lay down tracks, draw notes
// on a piano roll, adjust the mix — while an AI producer agent adds
// complementary parts, suggests harmonies, and fills gaps.

import React from "react";
import { z } from "zod";
import {
  defineExperience,
  defineTool,
  defineTest,
  type CanvasProps,
} from "@vibevibes/sdk";

import {
  TransportBar,
  TrackHeader,
  Timeline,
  PianoRoll,
  AddTrackPanel,
  type Track,
  type Pattern,
  type Clip,
  type Note,
} from "./components";

import {
  INSTRUMENTS,
  INSTRUMENT_COLORS,
  INSTRUMENT_ICONS,
  SCALE_NAMES,
  NOTE_NAMES,
  STEPS_PER_BAR,
  generateId,
  type InstrumentType,
} from "./utils";

// ── React.createElement shorthand ───────────────────────────────────────

const h = React.createElement;

// ── Theme ───────────────────────────────────────────────────────────────

const C = {
  bg: "#09090b",
  surface: "#111113",
  border: "#1e1e24",
  accent: "#6366f1",
  text: "#e2e2e8",
  muted: "#6b6b80",
};

// ── State Shape ─────────────────────────────────────────────────────────

type DAWState = {
  bpm: number;
  key: string;          // root note: "C", "D", etc.
  scale: string;        // "major", "minor", "pentatonic", etc.
  isPlaying: boolean;
  currentBar: number;
  totalBars: number;
  tracks: Track[];
  patterns: Pattern[];
  selectedTrackId: string | null;
  selectedPatternId: string | null;
  songName: string;
  turnCount: number;
};

function initialState(): DAWState {
  return {
    bpm: 120,
    key: "C",
    scale: "minor",
    isPlaying: false,
    currentBar: 0,
    totalBars: 16,
    tracks: [],
    patterns: [],
    selectedTrackId: null,
    selectedPatternId: null,
    songName: "Untitled Session",
    turnCount: 0,
  };
}

function ensureState(s: any): DAWState {
  if (!s || !Array.isArray(s.tracks)) return initialState();
  return s as DAWState;
}

// ── Canvas ──────────────────────────────────────────────────────────────

const Canvas: React.FC<CanvasProps> = ({
  sharedState,
  callTool,
  participants,
  actorId,
}) => {
  const state = ensureState(sharedState);
  const {
    bpm, key: musicalKey, scale, isPlaying, currentBar, totalBars,
    tracks, patterns, selectedTrackId, selectedPatternId, songName,
  } = state;

  const selectedTrack = tracks.find(t => t.id === selectedTrackId) || null;
  const selectedPattern = patterns.find(p => p.id === selectedPatternId) || null;

  // ── Transport ───────────────────────────────────────────────────────

  const transport = h(TransportBar, {
    bpm,
    isPlaying,
    currentBar,
    totalBars,
    key: musicalKey,
    scale,
    trackCount: tracks.length,
    participantCount: participants.length,
    onPlay: () => callTool("daw.transport", { action: "play" }),
    onStop: () => callTool("daw.transport", { action: "stop" }),
    onBpmChange: (newBpm: number) => callTool("daw.set_tempo", { bpm: newBpm }),
  });

  // ── Add Track Panel ─────────────────────────────────────────────────

  const addTrackPanel = h(AddTrackPanel, {
    onAddTrack: (instrument: InstrumentType, name: string) =>
      callTool("daw.add_track", { instrument, name }),
  });

  // ── Main: Track Headers + Timeline ──────────────────────────────────

  const trackHeaders = h(
    "div",
    {
      style: {
        width: 200,
        flexShrink: 0,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        overflowY: "auto" as const,
      },
    },
    // Spacer for bar header row
    h("div", { style: { height: 24, borderBottom: `1px solid ${C.border}` } }),
    ...tracks.map(track =>
      h(TrackHeader, {
        key: track.id,
        track,
        isSelected: track.id === selectedTrackId,
        onSelect: () => callTool("daw.select_track", { trackId: track.id }),
        onMute: () => callTool("daw.set_track_mute", { trackId: track.id, muted: !track.muted }),
        onSolo: () => callTool("daw.set_track_solo", { trackId: track.id, solo: !track.solo }),
        onVolumeChange: (vol: number) => callTool("daw.set_track_volume", { trackId: track.id, volume: vol }),
      })
    )
  );

  const timeline = h(Timeline, {
    tracks,
    patterns,
    totalBars,
    selectedTrackId,
    selectedPatternId,
    currentBar,
    isPlaying,
    onSelectClip: (trackId: string, clip: Clip) => {
      callTool("daw.select_track", { trackId });
      callTool("daw.select_pattern", { patternId: clip.patternId });
    },
    onAddClip: (trackId: string, bar: number) => {
      // Create pattern + clip in one flow
      const patternName = `P${state.patterns.length + 1}`;
      callTool("daw.add_pattern", { name: patternName, bars: 1 }).then((result: any) => {
        if (result && result.patternId) {
          callTool("daw.place_clip", { trackId, patternId: result.patternId, startBar: bar });
        }
      });
    },
  });

  const mainArea = h(
    "div",
    {
      style: {
        display: "flex",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      },
    },
    trackHeaders,
    timeline
  );

  // ── Piano Roll ──────────────────────────────────────────────────────

  const pianoRoll = h(PianoRoll, {
    pattern: selectedPattern,
    trackName: selectedTrack?.name || "",
    trackInstrument: (selectedTrack?.instrument || "synth") as InstrumentType,
    onToggleNote: (midi: number, step: number) => {
      if (!selectedPatternId) return;
      // Check if note exists
      const existing = selectedPattern?.notes.find(n => n.midi === midi && n.step === step);
      if (existing) {
        callTool("daw.remove_note", { patternId: selectedPatternId, noteId: existing.id });
      } else {
        callTool("daw.add_note", {
          patternId: selectedPatternId,
          midi,
          step,
          duration: 1,
          velocity: 100,
        });
      }
    },
    onClose: () => callTool("daw.select_pattern", { patternId: "" }),
  });

  // ── Empty State ─────────────────────────────────────────────────────

  const emptyState = tracks.length === 0
    ? h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 16,
            color: C.muted,
          },
        },
        h("div", { style: { fontSize: "3rem", opacity: 0.3 } }, "\u{1F3B6}"),
        h("div", { style: { fontSize: "1rem", fontWeight: 700 } }, "No tracks yet"),
        h("div", { style: { fontSize: "0.8rem", opacity: 0.7, maxWidth: 300, textAlign: "center" as const, lineHeight: 1.5 } },
          "Add a track above to start creating. The AI producer will join and start adding complementary parts."
        )
      )
    : null;

  // ── Footer ──────────────────────────────────────────────────────────

  const footer = h(
    "div",
    {
      style: {
        fontSize: "0.6rem",
        color: C.muted,
        textAlign: "center" as const,
        padding: "6px 0",
        opacity: 0.5,
        borderTop: `1px solid ${C.border}`,
      },
    },
    `Vibe Studio | ${participants.length} connected | ${actorId}`
  );

  // ── Root Layout ─────────────────────────────────────────────────────

  return h(
    "div",
    {
      style: {
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column" as const,
      },
    },
    transport,
    addTrackPanel,
    tracks.length > 0 ? mainArea : emptyState,
    selectedPattern ? pianoRoll : null,
    footer
  );
};

// ── Tools ───────────────────────────────────────────────────────────────

const tools = [
  // 1. Set tempo
  defineTool({
    name: "daw.set_tempo",
    description: "Change the BPM (tempo) of the session. Range: 40-240.",
    input_schema: z.object({
      bpm: z.number().min(40).max(240).describe("Beats per minute"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      ctx.setState({ ...s, bpm: input.bpm, turnCount: s.turnCount + 1 });
      return { bpm: input.bpm };
    },
  }),

  // 2. Transport (play/stop)
  defineTool({
    name: "daw.transport",
    description: "Control playback — play or stop.",
    input_schema: z.object({
      action: z.enum(["play", "stop"]).describe("Transport action"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const isPlaying = input.action === "play";
      ctx.setState({
        ...s,
        isPlaying,
        currentBar: isPlaying ? s.currentBar : 0,
      });
      return { isPlaying };
    },
  }),

  // 3. Add track
  defineTool({
    name: "daw.add_track",
    description: "Add a new track with a specific instrument type. Each track represents one instrument lane in the DAW.",
    input_schema: z.object({
      name: z.string().min(1).describe("Name of the track"),
      instrument: z.enum(INSTRUMENTS as unknown as [string, ...string[]]).describe("Instrument type for this track"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const id = generateId();
      const track: Track = {
        id,
        name: input.name,
        instrument: input.instrument as InstrumentType,
        volume: 0.8,
        muted: false,
        solo: false,
        clips: [],
      };
      ctx.setState({
        ...s,
        tracks: [...s.tracks, track],
        selectedTrackId: id,
        turnCount: s.turnCount + 1,
      });
      return { trackId: id, name: input.name, instrument: input.instrument, totalTracks: s.tracks.length + 1 };
    },
  }),

  // 4. Remove track
  defineTool({
    name: "daw.remove_track",
    description: "Remove a track from the session.",
    input_schema: z.object({
      trackId: z.string().describe("ID of the track to remove"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const tracks = s.tracks.filter(t => t.id !== input.trackId);
      const selectedTrackId = s.selectedTrackId === input.trackId ? null : s.selectedTrackId;
      ctx.setState({ ...s, tracks, selectedTrackId, turnCount: s.turnCount + 1 });
      return { removed: input.trackId, remainingTracks: tracks.length };
    },
  }),

  // 5. Add pattern
  defineTool({
    name: "daw.add_pattern",
    description: "Create a reusable pattern (empty, to be filled with notes). Patterns can be placed on any track's timeline as clips.",
    input_schema: z.object({
      name: z.string().min(1).describe("Pattern name"),
      bars: z.number().min(1).max(8).default(1).describe("Length in bars (1-8)"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const id = generateId();
      const pattern: Pattern = {
        id,
        name: input.name,
        bars: input.bars,
        notes: [],
      };
      ctx.setState({
        ...s,
        patterns: [...s.patterns, pattern],
        selectedPatternId: id,
        turnCount: s.turnCount + 1,
      });
      return { patternId: id, name: input.name, bars: input.bars };
    },
  }),

  // 6. Place clip on timeline
  defineTool({
    name: "daw.place_clip",
    description: "Place a pattern as a clip on a track's timeline at a specific bar position.",
    input_schema: z.object({
      trackId: z.string().describe("Track to place the clip on"),
      patternId: z.string().describe("Pattern to use for this clip"),
      startBar: z.number().min(0).describe("Bar position on the timeline (0-indexed)"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const trackIdx = s.tracks.findIndex(t => t.id === input.trackId);
      if (trackIdx === -1) return { error: "Track not found" };
      const patternExists = s.patterns.some(p => p.id === input.patternId);
      if (!patternExists) return { error: "Pattern not found" };

      const clipId = generateId();
      const clip: Clip = { id: clipId, patternId: input.patternId, startBar: input.startBar };
      const track = {
        ...s.tracks[trackIdx],
        clips: [...s.tracks[trackIdx].clips.filter(c => c.startBar !== input.startBar), clip],
      };
      const tracks = [...s.tracks.slice(0, trackIdx), track, ...s.tracks.slice(trackIdx + 1)];

      ctx.setState({ ...s, tracks, turnCount: s.turnCount + 1 });
      return { clipId, trackId: input.trackId, patternId: input.patternId, startBar: input.startBar };
    },
  }),

  // 7. Remove clip
  defineTool({
    name: "daw.remove_clip",
    description: "Remove a clip from a track's timeline.",
    input_schema: z.object({
      trackId: z.string().describe("Track ID"),
      clipId: z.string().describe("Clip ID to remove"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const trackIdx = s.tracks.findIndex(t => t.id === input.trackId);
      if (trackIdx === -1) return { error: "Track not found" };

      const track = {
        ...s.tracks[trackIdx],
        clips: s.tracks[trackIdx].clips.filter(c => c.id !== input.clipId),
      };
      const tracks = [...s.tracks.slice(0, trackIdx), track, ...s.tracks.slice(trackIdx + 1)];
      ctx.setState({ ...s, tracks, turnCount: s.turnCount + 1 });
      return { removed: input.clipId };
    },
  }),

  // 8. Add note to pattern
  defineTool({
    name: "daw.add_note",
    description: "Add a note to a pattern. Specify the MIDI pitch (48-71 typical range), step position (16th notes within the pattern), duration (in 16th notes), and velocity (0-127).",
    input_schema: z.object({
      patternId: z.string().describe("Pattern to add the note to"),
      midi: z.number().min(0).max(127).describe("MIDI note number (60 = C4, middle C)"),
      step: z.number().min(0).describe("Step position within the pattern (16th notes, 0-indexed)"),
      duration: z.number().min(1).max(64).default(1).describe("Note duration in 16th notes"),
      velocity: z.number().min(1).max(127).default(100).describe("Note velocity (loudness)"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const patIdx = s.patterns.findIndex(p => p.id === input.patternId);
      if (patIdx === -1) return { error: "Pattern not found" };

      const noteId = generateId();
      const note: Note = {
        id: noteId,
        midi: input.midi,
        step: input.step,
        duration: input.duration,
        velocity: input.velocity,
      };

      const pattern = {
        ...s.patterns[patIdx],
        notes: [...s.patterns[patIdx].notes, note],
      };
      const patterns = [...s.patterns.slice(0, patIdx), pattern, ...s.patterns.slice(patIdx + 1)];
      ctx.setState({ ...s, patterns, turnCount: s.turnCount + 1 });
      return { noteId, midi: input.midi, step: input.step, totalNotes: pattern.notes.length };
    },
  }),

  // 9. Remove note from pattern
  defineTool({
    name: "daw.remove_note",
    description: "Remove a specific note from a pattern by its ID.",
    input_schema: z.object({
      patternId: z.string().describe("Pattern ID"),
      noteId: z.string().describe("Note ID to remove"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const patIdx = s.patterns.findIndex(p => p.id === input.patternId);
      if (patIdx === -1) return { error: "Pattern not found" };

      const pattern = {
        ...s.patterns[patIdx],
        notes: s.patterns[patIdx].notes.filter(n => n.id !== input.noteId),
      };
      const patterns = [...s.patterns.slice(0, patIdx), pattern, ...s.patterns.slice(patIdx + 1)];
      ctx.setState({ ...s, patterns, turnCount: s.turnCount + 1 });
      return { removed: input.noteId, remainingNotes: pattern.notes.length };
    },
  }),

  // 10. Batch add notes (for AI to add chords/melodies efficiently)
  defineTool({
    name: "daw.batch_notes",
    description: "Add multiple notes to a pattern at once. Use this to write chords, melodies, or drum patterns efficiently. Each note specifies midi, step, duration, and velocity.",
    input_schema: z.object({
      patternId: z.string().describe("Pattern to add notes to"),
      notes: z.array(z.object({
        midi: z.number().min(0).max(127),
        step: z.number().min(0),
        duration: z.number().min(1).max(64).default(1),
        velocity: z.number().min(1).max(127).default(100),
      })).min(1).describe("Array of notes to add"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const patIdx = s.patterns.findIndex(p => p.id === input.patternId);
      if (patIdx === -1) return { error: "Pattern not found" };

      const newNotes: Note[] = input.notes.map(n => ({
        id: generateId(),
        midi: n.midi,
        step: n.step,
        duration: n.duration,
        velocity: n.velocity,
      }));

      const pattern = {
        ...s.patterns[patIdx],
        notes: [...s.patterns[patIdx].notes, ...newNotes],
      };
      const patterns = [...s.patterns.slice(0, patIdx), pattern, ...s.patterns.slice(patIdx + 1)];
      ctx.setState({ ...s, patterns, turnCount: s.turnCount + 1 });
      return { added: newNotes.length, totalNotes: pattern.notes.length, patternId: input.patternId };
    },
  }),

  // 11. Set track volume
  defineTool({
    name: "daw.set_track_volume",
    description: "Set the volume of a track (0.0 = silent, 1.0 = max).",
    input_schema: z.object({
      trackId: z.string().describe("Track ID"),
      volume: z.number().min(0).max(1).describe("Volume level (0.0-1.0)"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const trackIdx = s.tracks.findIndex(t => t.id === input.trackId);
      if (trackIdx === -1) return { error: "Track not found" };

      const track = { ...s.tracks[trackIdx], volume: input.volume };
      const tracks = [...s.tracks.slice(0, trackIdx), track, ...s.tracks.slice(trackIdx + 1)];
      ctx.setState({ ...s, tracks });
      return { trackId: input.trackId, volume: input.volume };
    },
  }),

  // 12. Mute/unmute track
  defineTool({
    name: "daw.set_track_mute",
    description: "Mute or unmute a track.",
    input_schema: z.object({
      trackId: z.string().describe("Track ID"),
      muted: z.boolean().describe("Whether the track should be muted"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const trackIdx = s.tracks.findIndex(t => t.id === input.trackId);
      if (trackIdx === -1) return { error: "Track not found" };

      const track = { ...s.tracks[trackIdx], muted: input.muted };
      const tracks = [...s.tracks.slice(0, trackIdx), track, ...s.tracks.slice(trackIdx + 1)];
      ctx.setState({ ...s, tracks });
      return { trackId: input.trackId, muted: input.muted };
    },
  }),

  // 13. Solo track
  defineTool({
    name: "daw.set_track_solo",
    description: "Solo or unsolo a track.",
    input_schema: z.object({
      trackId: z.string().describe("Track ID"),
      solo: z.boolean().describe("Whether the track should be soloed"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      const trackIdx = s.tracks.findIndex(t => t.id === input.trackId);
      if (trackIdx === -1) return { error: "Track not found" };

      const track = { ...s.tracks[trackIdx], solo: input.solo };
      const tracks = [...s.tracks.slice(0, trackIdx), track, ...s.tracks.slice(trackIdx + 1)];
      ctx.setState({ ...s, tracks });
      return { trackId: input.trackId, solo: input.solo };
    },
  }),

  // 14. Select track
  defineTool({
    name: "daw.select_track",
    description: "Select a track for editing.",
    input_schema: z.object({
      trackId: z.string().describe("Track ID to select"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      ctx.setState({ ...s, selectedTrackId: input.trackId });
      return { selectedTrackId: input.trackId };
    },
  }),

  // 15. Select pattern
  defineTool({
    name: "daw.select_pattern",
    description: "Select a pattern to view/edit in the piano roll.",
    input_schema: z.object({
      patternId: z.string().describe("Pattern ID to select (empty string to deselect)"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      ctx.setState({ ...s, selectedPatternId: input.patternId || null });
      return { selectedPatternId: input.patternId || null };
    },
  }),

  // 16. Set key and scale
  defineTool({
    name: "daw.set_key",
    description: "Set the musical key and scale for the session. This helps the AI producer write notes that are harmonically compatible.",
    input_schema: z.object({
      key: z.enum(NOTE_NAMES as unknown as [string, ...string[]]).describe("Root note (e.g. C, D, F#)"),
      scale: z.enum(SCALE_NAMES as unknown as [string, ...string[]]).describe("Scale type (e.g. major, minor, pentatonic)"),
    }),
    handler: async (ctx, input) => {
      const s = ensureState(ctx.state);
      ctx.setState({ ...s, key: input.key, scale: input.scale, turnCount: s.turnCount + 1 });
      return { key: input.key, scale: input.scale };
    },
  }),
];

// ── Agent Hints ─────────────────────────────────────────────────────────

const agentHints = [
  {
    trigger: "when there are no tracks yet, add a foundation — a drums track and a bass track to get things started",
    condition: "!state.tracks || state.tracks.length === 0",
    suggestedTools: ["daw.add_track"],
    priority: "high" as const,
    cooldownMs: 3000,
  },
  {
    trigger: "when a track has been added but has no clips, create a pattern and place it on the timeline",
    condition: "state.tracks?.some(t => t.clips.length === 0)",
    suggestedTools: ["daw.add_pattern", "daw.place_clip"],
    priority: "high" as const,
    cooldownMs: 4000,
  },
  {
    trigger: "when there are patterns with no notes, add notes to bring the pattern to life with a melody, chord progression, or rhythm",
    condition: "state.patterns?.some(p => p.notes.length === 0)",
    suggestedTools: ["daw.batch_notes"],
    priority: "high" as const,
    cooldownMs: 3000,
  },
  {
    trigger: "when there are fewer than 3 tracks, add complementary instruments to build a fuller arrangement",
    condition: "state.tracks && state.tracks.length > 0 && state.tracks.length < 3",
    suggestedTools: ["daw.add_track"],
    priority: "medium" as const,
    cooldownMs: 6000,
  },
  {
    trigger: "when there are multiple tracks with content, consider filling empty bars on the timeline with new patterns",
    condition: "state.tracks?.length >= 2 && state.tracks.some(t => t.clips.length > 0) && state.tracks.some(t => t.clips.length === 0)",
    suggestedTools: ["daw.add_pattern", "daw.place_clip", "daw.batch_notes"],
    priority: "medium" as const,
    cooldownMs: 8000,
  },
  {
    trigger: "periodically add variation — create new patterns or extend existing ones to keep the music evolving",
    condition: "state.turnCount > 0 && state.turnCount % 5 === 0",
    suggestedTools: ["daw.add_pattern", "daw.batch_notes", "daw.place_clip"],
    priority: "low" as const,
    cooldownMs: 10000,
  },
];

// ── Tests ───────────────────────────────────────────────────────────────

const tests = [
  defineTest({
    name: "add_track creates a track with the correct instrument",
    run: async ({ tool, ctx, expect }) => {
      const addTrack = tool("daw.add_track");
      const c = ctx({ state: initialState() });

      await addTrack.handler(c, { name: "My Synth", instrument: "synth" });

      const state = c.getState() as DAWState;
      expect(state.tracks.length).toBe(1);
      expect(state.tracks[0].instrument).toBe("synth");
      expect(state.tracks[0].name).toBe("My Synth");
      expect(state.tracks[0].volume).toBe(0.8);
      expect(state.tracks[0].muted).toBe(false);
    },
  }),

  defineTest({
    name: "add_pattern creates an empty pattern",
    run: async ({ tool, ctx, expect }) => {
      const addPattern = tool("daw.add_pattern");
      const c = ctx({ state: initialState() });

      await addPattern.handler(c, { name: "Beat 1", bars: 2 });

      const state = c.getState() as DAWState;
      expect(state.patterns.length).toBe(1);
      expect(state.patterns[0].name).toBe("Beat 1");
      expect(state.patterns[0].bars).toBe(2);
      expect(state.patterns[0].notes.length).toBe(0);
    },
  }),

  defineTest({
    name: "batch_notes adds multiple notes to a pattern",
    run: async ({ tool, ctx, expect }) => {
      const addPattern = tool("daw.add_pattern");
      const batchNotes = tool("daw.batch_notes");
      const c = ctx({ state: initialState() });

      await addPattern.handler(c, { name: "Chord", bars: 1 });
      const stateAfter = c.getState() as DAWState;
      const patternId = stateAfter.patterns[0].id;

      await batchNotes.handler(c, {
        patternId,
        notes: [
          { midi: 60, step: 0, duration: 4, velocity: 100 },
          { midi: 64, step: 0, duration: 4, velocity: 90 },
          { midi: 67, step: 0, duration: 4, velocity: 80 },
        ],
      });

      const finalState = c.getState() as DAWState;
      expect(finalState.patterns[0].notes.length).toBe(3);
      expect(finalState.patterns[0].notes[0].midi).toBe(60);
      expect(finalState.patterns[0].notes[1].midi).toBe(64);
      expect(finalState.patterns[0].notes[2].midi).toBe(67);
    },
  }),

  defineTest({
    name: "place_clip assigns a pattern to a track at the correct bar",
    run: async ({ tool, ctx, expect }) => {
      const addTrack = tool("daw.add_track");
      const addPattern = tool("daw.add_pattern");
      const placeClip = tool("daw.place_clip");
      const c = ctx({ state: initialState() });

      await addTrack.handler(c, { name: "Bass", instrument: "bass" });
      await addPattern.handler(c, { name: "Bass Line", bars: 1 });

      const state2 = c.getState() as DAWState;
      const trackId = state2.tracks[0].id;
      const patternId = state2.patterns[0].id;

      await placeClip.handler(c, { trackId, patternId, startBar: 4 });

      const finalState = c.getState() as DAWState;
      expect(finalState.tracks[0].clips.length).toBe(1);
      expect(finalState.tracks[0].clips[0].startBar).toBe(4);
      expect(finalState.tracks[0].clips[0].patternId).toBe(patternId);
    },
  }),
];

// ── Manifest ────────────────────────────────────────────────────────────

const manifest = {
  id: "vibe-studio",
  version: "0.0.1",
  title: "Vibe Studio",
  description:
    "A collaborative DAW where humans and AI create music together in real-time. Add tracks, draw notes on the piano roll, shape the arrangement — while an AI producer adds complementary parts and fills gaps.",
  requested_capabilities: ["state.write"] as string[],
  category: "creative",
  tags: ["music", "collaborative", "daw", "audio", "creative", "ai-native"],
  agentSlots: [
    {
      role: "producer",
      systemPrompt: `You are the Producer — an AI musician that collaboratively creates music with humans in a shared DAW.

Your responsibilities:
1. FOUNDATION: If there are no tracks, start with a drums track and a bass track. Create patterns with notes that establish a groove.
2. COMPLEMENT: Watch what tracks and patterns the human creates. Add complementary parts:
   - If they add a melody, add a bass line or chord pad underneath
   - If they add drums, add a bass line or melodic hook on top
   - If they add chords, add arpeggiated patterns or a lead melody
3. FILL GAPS: Look at the timeline. If some bars are empty on a track, create patterns and place clips to fill them out. Make the arrangement feel complete.
4. MUSICALITY: Write notes that are musically coherent:
   - Stay in the session's key and scale
   - Use the batch_notes tool to write full musical phrases (melodies, chords, rhythms)
   - For drums: MIDI 36=kick, 38=snare, 42=hihat, 46=open hihat, 49=crash, 51=ride
   - For bass: keep it in the lower octaves (MIDI 36-55)
   - For leads/synths: use the middle range (MIDI 55-72)
   - For pads/strings: use wider voicings and longer durations
5. RESPOND TO CHANGES: When the human mutes/solos tracks or changes tempo/key, adapt. If they mute the drums, maybe add more rhythmic elements to another track.

Style guidelines:
- Start simple, build complexity gradually
- Leave space — not every step needs a note
- Vary velocity for dynamics (accents on beats 1 and 3)
- Create 4-8 note melodies that repeat with variation
- Use call-and-response between tracks
- Make it groove — rhythm matters more than harmony

IMPORTANT: Use daw.batch_notes to write multiple notes at once. This is much more efficient than adding notes one at a time. Write musical phrases, not individual notes.`,
      allowedTools: [
        "daw.add_track",
        "daw.add_pattern",
        "daw.place_clip",
        "daw.batch_notes",
        "daw.add_note",
        "daw.remove_note",
        "daw.set_track_volume",
        "daw.set_track_mute",
        "daw.set_track_solo",
        "daw.set_tempo",
        "daw.set_key",
        "daw.select_track",
        "daw.select_pattern",
      ],
      autoSpawn: true,
      maxInstances: 1,
    },
  ],
};

// ── Export ───────────────────────────────────────────────────────────────

export default defineExperience({
  manifest,
  Canvas,
  tools,
  tests,
  agentHints,
});
