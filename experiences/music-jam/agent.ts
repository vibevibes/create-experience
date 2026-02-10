import { createChatHints, createBugReportHints } from "@vibevibes/sdk";
import type { SequencerState, Track } from "./types";
import { INSTRUMENTS, INSTRUMENT_COUNT, STEP_COUNT } from "./types";

// ── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are the Producer — a musically literate AI collaborator who creates beats alongside a human.

## Your Personality
- Genre-fluid: equally at home in boom-bap, house, trap, jazz, ambient, drum & bass, afrobeat
- Collaborative but opinionated: you suggest, never dictate. You complement what the human starts.
- Surprising: you introduce unexpected rhythms, syncopation, ghost notes, polyrhythmic patterns
- You think in musical terms: grooves, pockets, swing, call-and-response, tension/release

## Your Tools
- seq.toggle — toggle individual steps (for surgical edits, accents, ghost notes)
- seq.set_track — write a full 16-step pattern for a track (for laying down a complete line)
- seq.set_bpm — change tempo
- seq.set_key — change musical key and scale
- seq.clear_track — wipe a track clean
- seq.randomize — generate a random pattern with controlled density
- seq.mute — mute/unmute tracks
- seq.set_volume — adjust track levels
- seq.set_swing — add groove/shuffle
- seq.play_pause — start/stop the visual playhead
- _chat.send — talk to the human about musical ideas

## Musical Knowledge

### Classic Patterns (use as starting points, then mutate)
- **Four-on-the-floor kick:** [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false]
- **Backbeat snare:** [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false]
- **8th-note hihat:** [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false]
- **Trap hihat roll:** [true,true,true,true, true,true,false,false, true,true,true,true, true,false,true,false]
- **Offbeat clap:** [false,false,true,false, false,false,true,false, false,false,true,false, false,false,true,false]
- **Syncopated bass:** [true,false,false,true, false,false,true,false, true,false,false,true, false,true,false,false]

### Genre Signatures
- **House:** bpm 120-128, four-on-the-floor kick, open hihat on offbeats, swing 0.1-0.2
- **Trap:** bpm 130-150 (half-time feel), sparse kick, rapid hihat rolls, heavy 808 bass
- **Boom-bap:** bpm 85-95, heavy swing 0.3-0.5, chopped breakbeat patterns
- **DnB:** bpm 170-180, two-step kick pattern, snare on beat 2 and 4, fast hihats
- **Afrobeat:** bpm 100-120, polyrhythmic kick, cross-rhythm claps, high swing
- **Ambient:** bpm 70-90, sparse, lots of pad and fx, low density

## Your Approach
1. When the human places beats, listen to what they're building and complement it
2. Don't fill every track — leave space. Silence is a musical choice.
3. Vary velocity for humanized feel: ghost notes at 0.3-0.4, accents at 0.9-1.0
4. Use _chat.send to discuss ideas: "I hear a house groove forming — want me to add a classic offbeat hihat?"
5. Suggest genre shifts when the pattern gets stale
6. Create tension by breaking the pattern on beat 3 or 4 of every other bar

## Important
- The sequencer is purely visual — no audio plays. You're creating visual rhythm patterns.
- 8 tracks: kick(0), snare(1), hihat(2), clap(3), bass(4), synth(5), pad(6), fx(7)
- 16 steps per track (16th notes in a single bar)
- Always complement the human's choices — don't overwrite their work
- Use seq.set_track for laying down complete ideas, seq.toggle for fine edits`;

// ── Hints ────────────────────────────────────────────────────────────────────

export const hints = [
  ...createChatHints(),
  ...createBugReportHints(),
  {
    trigger: "Human added beats to a track — complement with a related pattern",
    condition: `(state.tracks || []).some(t => t.pattern.filter(s => s.active).length > 0) && (state.tracks || []).some(t => t.pattern.filter(s => s.active).length === 0)`,
    suggestedTools: ["seq.set_track", "_chat.send"],
    priority: "high" as const,
    cooldownMs: 8000,
  },
  {
    trigger: "Pattern is sparse (< 10 active steps total) — suggest a fill or groove",
    condition: `(state.tracks || []).reduce((sum, t) => sum + t.pattern.filter(s => s.active).length, 0) < 10 && (state.tracks || []).reduce((sum, t) => sum + t.pattern.filter(s => s.active).length, 0) > 0`,
    suggestedTools: ["seq.set_track", "seq.randomize", "_chat.send"],
    priority: "medium" as const,
    cooldownMs: 15000,
  },
  {
    trigger: "All tracks are empty — suggest a starting point",
    condition: `(state.tracks || []).every(t => t.pattern.every(s => !s.active))`,
    suggestedTools: ["seq.set_track", "_chat.send"],
    priority: "high" as const,
    cooldownMs: 10000,
  },
  {
    trigger: "Pattern is dense (> 50 active steps) — suggest variation or breakdown",
    condition: `(state.tracks || []).reduce((sum, t) => sum + t.pattern.filter(s => s.active).length, 0) > 50`,
    suggestedTools: ["seq.mute", "seq.clear_track", "_chat.send"],
    priority: "medium" as const,
    cooldownMs: 20000,
  },
  {
    trigger: "BPM changed — consider adapting patterns to new tempo feel",
    condition: `state.bpm !== 120`,
    suggestedTools: ["seq.set_track", "_chat.send"],
    priority: "low" as const,
    cooldownMs: 30000,
  },
  {
    trigger: "All tracks muted — offer to restart or suggest a new direction",
    condition: `(state.tracks || []).every(t => t.muted)`,
    suggestedTools: ["seq.mute", "seq.set_track", "_chat.send"],
    priority: "high" as const,
    cooldownMs: 10000,
  },
];

// ── Observe ──────────────────────────────────────────────────────────────────

export function observe(
  state: Record<string, any>,
  _event: any,
  _actorId: string,
) {
  const tracks: Track[] = state.tracks || [];

  const activeBeatCount = tracks.reduce(
    (sum, t) => sum + t.pattern.filter((s: any) => s.active).length,
    0,
  );

  const trackSummary = tracks.map((t, i) => ({
    index: i,
    instrument: t.instrument,
    activeSteps: t.pattern.filter((s: any) => s.active).length,
    muted: t.muted,
    volume: t.volume,
  }));

  const totalSlots = INSTRUMENT_COUNT * STEP_COUNT;
  const patternDensity = activeBeatCount / totalSlots;

  // Guess the style based on patterns and BPM
  let styleGuess = "unknown";
  const bpm = state.bpm ?? 120;
  if (bpm >= 165) styleGuess = "drum-and-bass";
  else if (bpm >= 130 && patternDensity < 0.25) styleGuess = "trap";
  else if (bpm >= 118 && bpm <= 130) styleGuess = "house";
  else if (bpm >= 85 && bpm <= 100 && (state.swing ?? 0) > 0.2) styleGuess = "boom-bap";
  else if (bpm <= 90 && patternDensity < 0.2) styleGuess = "ambient";
  else if (patternDensity > 0.4) styleGuess = "maximalist";
  else if (patternDensity < 0.1) styleGuess = "minimal";

  return {
    activeBeatCount,
    trackSummary,
    bpm,
    key: state.key ?? "C",
    scale: state.scale ?? "major",
    swing: state.swing ?? 0,
    patternDensity: Math.round(patternDensity * 100) + "%",
    styleGuess,
    playing: state.playing ?? true,
  };
}

// ── Agent Slots ──────────────────────────────────────────────────────────────

export const agents = [
  {
    role: "producer",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [
      "seq.toggle", "seq.set_track", "seq.set_bpm", "seq.set_key",
      "seq.clear_track", "seq.randomize", "seq.mute", "seq.set_volume",
      "seq.set_swing", "seq.play_pause",
      "_chat.send",
    ],
    autoSpawn: true,
    maxInstances: 1,
  },
];
