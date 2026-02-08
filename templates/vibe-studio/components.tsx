// ── Vibe Studio — DAW Components ────────────────────────────────────────
// All rendering via React.createElement. Inline styles. Dark theme.

import React from "react";
import {
  midiToName,
  INSTRUMENT_COLORS,
  INSTRUMENT_ICONS,
  STEPS_PER_BAR,
  MIDI_MIN,
  MIDI_MAX,
  NOTE_NAMES,
  type InstrumentType,
} from "./utils";

const h = React.createElement;

// ── Theme ───────────────────────────────────────────────────────────────

const C = {
  bg: "#09090b",
  surface: "#111113",
  surfaceHover: "#18181c",
  border: "#1e1e24",
  borderLight: "#2a2a34",
  accent: "#6366f1",
  accentDim: "#4f46e5",
  accentGlow: "rgba(99, 102, 241, 0.15)",
  text: "#e2e2e8",
  muted: "#6b6b80",
  success: "#22c55e",
  warn: "#f59e0b",
  danger: "#ef4444",
  playhead: "#22d3ee",
};

const pill: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: "0.6rem",
  fontWeight: 600,
  letterSpacing: "0.03em",
};

// ── Types (mirror state shape) ──────────────────────────────────────────

export type Note = {
  id: string;
  midi: number;
  step: number;      // 16th-note position within pattern
  duration: number;   // in 16th notes
  velocity: number;   // 0-127
};

export type Pattern = {
  id: string;
  name: string;
  bars: number;       // length in bars
  notes: Note[];
};

export type Clip = {
  id: string;
  patternId: string;
  startBar: number;   // bar position on timeline
};

export type Track = {
  id: string;
  name: string;
  instrument: InstrumentType;
  volume: number;     // 0.0 - 1.0
  muted: boolean;
  solo: boolean;
  clips: Clip[];
};

// ── Transport Bar ───────────────────────────────────────────────────────

type TransportProps = {
  bpm: number;
  isPlaying: boolean;
  currentBar: number;
  totalBars: number;
  key: string;
  scale: string;
  trackCount: number;
  participantCount: number;
  onPlay: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
};

export function TransportBar({
  bpm, isPlaying, currentBar, totalBars,
  key: musicalKey, scale, trackCount, participantCount,
  onPlay, onStop, onBpmChange,
}: TransportProps) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        gap: 16,
      },
    },
    // Left: Logo + title
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10 } },
      h("span", { style: { fontSize: "1.4rem" } }, "\u{1F3B5}"),
      h(
        "div",
        null,
        h("div", { style: { fontSize: "1.1rem", fontWeight: 800, color: C.text, letterSpacing: "-0.02em" } }, "Vibe Studio"),
        h("div", { style: { fontSize: "0.6rem", color: C.muted, marginTop: 1 } }, "Collaborative DAW")
      )
    ),
    // Center: Transport controls
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 12 } },
      // Play/Stop
      h(
        "button",
        {
          onClick: isPlaying ? onStop : onPlay,
          style: {
            width: 36, height: 36, borderRadius: "50%", border: "none",
            background: isPlaying ? C.danger : C.success,
            color: "#fff", fontSize: "1rem", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isPlaying ? `0 0 12px ${C.danger}44` : `0 0 12px ${C.success}44`,
          },
        },
        isPlaying ? "\u{23F9}" : "\u{25B6}"
      ),
      // BPM
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 6, background: C.bg, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}` } },
        h("span", { style: { fontSize: "0.65rem", color: C.muted, fontWeight: 600 } }, "BPM"),
        h(
          "button",
          {
            onClick: () => onBpmChange(Math.max(40, bpm - 5)),
            style: { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "0.9rem", padding: "0 4px" },
          },
          "-"
        ),
        h("span", { style: { fontSize: "1rem", fontWeight: 800, color: C.text, minWidth: 32, textAlign: "center" as const } }, String(bpm)),
        h(
          "button",
          {
            onClick: () => onBpmChange(Math.min(240, bpm + 5)),
            style: { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "0.9rem", padding: "0 4px" },
          },
          "+"
        )
      ),
      // Bar position
      h(
        "div",
        { style: { background: C.bg, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.75rem", color: C.text, fontWeight: 600 } },
        `Bar ${currentBar + 1} / ${totalBars}`
      ),
      // Key + Scale
      h(
        "div",
        { style: { ...pill, background: C.accent + "22", color: C.accent } },
        `${musicalKey} ${scale}`
      )
    ),
    // Right: Stats
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 12, fontSize: "0.7rem", color: C.muted } },
      h("span", null, `${trackCount} tracks`),
      h("span", { style: { opacity: 0.3 } }, "|"),
      h("span", null, `${participantCount} online`)
    )
  );
}

// ── Track Header ────────────────────────────────────────────────────────

type TrackHeaderProps = {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
  onMute: () => void;
  onSolo: () => void;
  onVolumeChange: (vol: number) => void;
};

export function TrackHeader({
  track, isSelected, onSelect, onMute, onSolo, onVolumeChange,
}: TrackHeaderProps) {
  const color = INSTRUMENT_COLORS[track.instrument] || C.accent;
  const icon = INSTRUMENT_ICONS[track.instrument] || "\u{1F3B5}";

  return h(
    "div",
    {
      onClick: onSelect,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: isSelected ? C.surfaceHover : C.surface,
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `3px solid ${isSelected ? color : "transparent"}`,
        cursor: "pointer",
        minWidth: 200,
        height: 52,
      },
    },
    // Icon
    h("span", { style: { fontSize: "1rem" } }, icon),
    // Name + instrument
    h(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      h("div", {
        style: {
          fontSize: "0.75rem", fontWeight: 700, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        },
      }, track.name),
      h("div", {
        style: { ...pill, background: color + "22", color, marginTop: 2 },
      }, track.instrument)
    ),
    // Volume slider (thin)
    h("input", {
      type: "range",
      min: 0, max: 100, value: Math.round(track.volume * 100),
      onClick: (e: any) => e.stopPropagation(),
      onChange: (e: any) => onVolumeChange(parseInt(e.target.value, 10) / 100),
      style: { width: 40, accentColor: color, cursor: "pointer" },
    }),
    // Mute button
    h(
      "button",
      {
        onClick: (e: any) => { e.stopPropagation(); onMute(); },
        style: {
          width: 22, height: 22, borderRadius: 4, border: "none",
          fontSize: "0.6rem", fontWeight: 800, cursor: "pointer",
          background: track.muted ? C.danger + "33" : "transparent",
          color: track.muted ? C.danger : C.muted,
        },
      },
      "M"
    ),
    // Solo button
    h(
      "button",
      {
        onClick: (e: any) => { e.stopPropagation(); onSolo(); },
        style: {
          width: 22, height: 22, borderRadius: 4, border: "none",
          fontSize: "0.6rem", fontWeight: 800, cursor: "pointer",
          background: track.solo ? C.warn + "33" : "transparent",
          color: track.solo ? C.warn : C.muted,
        },
      },
      "S"
    )
  );
}

// ── Timeline Grid ───────────────────────────────────────────────────────

type TimelineProps = {
  tracks: Track[];
  patterns: Pattern[];
  totalBars: number;
  selectedTrackId: string | null;
  selectedPatternId: string | null;
  currentBar: number;
  isPlaying: boolean;
  onSelectClip: (trackId: string, clip: Clip) => void;
  onAddClip: (trackId: string, bar: number) => void;
};

export function Timeline({
  tracks, patterns, totalBars, selectedTrackId, selectedPatternId,
  currentBar, isPlaying, onSelectClip, onAddClip,
}: TimelineProps) {
  const barWidth = 80;
  const trackHeight = 52;
  const totalWidth = totalBars * barWidth;

  // Bar numbers header
  const barHeaders = [];
  for (let i = 0; i < totalBars; i++) {
    barHeaders.push(
      h("div", {
        key: `bar-${i}`,
        style: {
          position: "absolute" as const,
          left: i * barWidth,
          top: 0,
          width: barWidth,
          height: 24,
          borderRight: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.6rem",
          color: C.muted,
          fontWeight: 600,
          background: i % 4 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
        },
      }, String(i + 1))
    );
  }

  // Track rows
  const trackRows = tracks.map((track, tIdx) => {
    const color = INSTRUMENT_COLORS[track.instrument] || C.accent;

    // Grid cells (one per bar)
    const cells = [];
    for (let bar = 0; bar < totalBars; bar++) {
      const clip = track.clips.find(c => c.startBar === bar);
      const pattern = clip ? patterns.find(p => p.id === clip.patternId) : null;
      const isClipSelected = clip && selectedPatternId === clip.patternId;

      cells.push(
        h("div", {
          key: `${track.id}-${bar}`,
          onClick: () => clip ? onSelectClip(track.id, clip) : onAddClip(track.id, bar),
          style: {
            position: "absolute" as const,
            left: bar * barWidth,
            top: 0,
            width: barWidth - 1,
            height: trackHeight - 1,
            borderRight: `1px solid ${C.border}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        },
          clip && pattern
            ? h("div", {
                style: {
                  width: "calc(100% - 4px)",
                  height: "calc(100% - 6px)",
                  borderRadius: 6,
                  background: `${color}${track.muted ? "22" : "44"}`,
                  border: `1px solid ${isClipSelected ? color : color + "66"}`,
                  boxShadow: isClipSelected ? `0 0 8px ${color}44` : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: track.muted ? C.muted : color,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                  padding: "0 6px",
                },
              }, pattern.name)
            : h("div", {
                style: {
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.15s",
                },
                onMouseEnter: (e: any) => { e.currentTarget.style.opacity = "0.5"; },
                onMouseLeave: (e: any) => { e.currentTarget.style.opacity = "0"; },
              }, h("span", { style: { fontSize: "1rem", color: C.muted } }, "+"))
        )
      );
    }

    return h("div", {
      key: track.id,
      style: {
        position: "relative" as const,
        height: trackHeight,
        borderBottom: `1px solid ${C.border}`,
        background: track.id === selectedTrackId ? "rgba(255,255,255,0.015)" : "transparent",
      },
    }, ...cells);
  });

  // Playhead
  const playhead = isPlaying
    ? h("div", {
        style: {
          position: "absolute" as const,
          left: currentBar * barWidth,
          top: 24,
          width: 2,
          height: tracks.length * trackHeight,
          background: C.playhead,
          boxShadow: `0 0 8px ${C.playhead}66`,
          zIndex: 10,
          pointerEvents: "none" as const,
        },
      })
    : null;

  return h(
    "div",
    {
      style: {
        position: "relative" as const,
        overflowX: "auto" as const,
        overflowY: "hidden" as const,
        flex: 1,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
      },
    },
    h("div", {
      style: {
        position: "relative" as const,
        width: totalWidth,
        minWidth: "100%",
      },
    },
      // Bar headers
      h("div", { style: { position: "relative" as const, height: 24 } }, ...barHeaders),
      // Track rows
      ...trackRows,
      // Playhead
      playhead
    )
  );
}

// ── Piano Roll ──────────────────────────────────────────────────────────

type PianoRollProps = {
  pattern: Pattern | null;
  trackName: string;
  trackInstrument: InstrumentType;
  onToggleNote: (midi: number, step: number) => void;
  onClose: () => void;
};

export function PianoRoll({
  pattern, trackName, trackInstrument, onToggleNote, onClose,
}: PianoRollProps) {
  if (!pattern) {
    return h("div", {
      style: {
        padding: 40,
        textAlign: "center" as const,
        color: C.muted,
        fontSize: "0.85rem",
        fontStyle: "italic",
      },
    }, "Select a clip to edit notes...");
  }

  const color = INSTRUMENT_COLORS[trackInstrument] || C.accent;
  const totalSteps = pattern.bars * STEPS_PER_BAR;

  // Show 2 octaves centered around C4 (MIDI 48-71) for non-drums, or 1 octave for drums
  const isDrums = trackInstrument === "drums";
  const pianoMin = isDrums ? 36 : 48;
  const pianoMax = isDrums ? 52 : 72;
  const noteRange: number[] = [];
  for (let n = pianoMax - 1; n >= pianoMin; n--) {
    noteRange.push(n);
  }

  const cellW = 24;
  const cellH = 14;
  const labelW = 44;

  // Note set for fast lookup
  const noteSet = new Set<string>();
  for (const n of pattern.notes) {
    noteSet.add(`${n.midi}-${n.step}`);
  }

  const rows = noteRange.map((midi) => {
    const name = midiToName(midi);
    const isBlack = name.includes("#");
    const isC = name.startsWith("C") && !name.includes("#");

    const cells = [];
    for (let step = 0; step < totalSteps; step++) {
      const hasNote = noteSet.has(`${midi}-${step}`);
      const isBeatStart = step % 4 === 0;
      const isBarStart = step % STEPS_PER_BAR === 0;

      cells.push(
        h("div", {
          key: `${midi}-${step}`,
          onClick: () => onToggleNote(midi, step),
          style: {
            width: cellW,
            height: cellH,
            borderRight: `1px solid ${isBarStart ? C.borderLight : isBeatStart ? C.border + "88" : C.border + "33"}`,
            borderBottom: `1px solid ${isC ? C.borderLight : C.border + "44"}`,
            background: hasNote
              ? color
              : isBlack
                ? "rgba(0,0,0,0.3)"
                : "transparent",
            cursor: "pointer",
            transition: "background 0.1s",
            boxShadow: hasNote ? `inset 0 0 4px ${color}88` : "none",
            borderRadius: hasNote ? 2 : 0,
          },
        })
      );
    }

    return h("div", {
      key: midi,
      style: { display: "flex", alignItems: "stretch" },
    },
      // Piano key label
      h("div", {
        style: {
          width: labelW,
          height: cellH,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 6,
          fontSize: "0.55rem",
          fontWeight: isC ? 700 : 500,
          color: isC ? C.text : C.muted,
          background: isBlack ? "rgba(0,0,0,0.4)" : C.surface,
          borderBottom: `1px solid ${isC ? C.borderLight : C.border + "44"}`,
          borderRight: `1px solid ${C.border}`,
          flexShrink: 0,
        },
      }, name),
      // Grid cells
      ...cells
    );
  });

  return h(
    "div",
    {
      style: {
        borderTop: `1px solid ${C.border}`,
        background: C.surface,
        display: "flex",
        flexDirection: "column" as const,
      },
    },
    // Header
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: `1px solid ${C.border}`,
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8 } },
        h("span", { style: { fontSize: "0.85rem" } }, INSTRUMENT_ICONS[trackInstrument] || "\u{1F3B5}"),
        h("span", { style: { fontSize: "0.8rem", fontWeight: 700, color: C.text } }, `${trackName} / ${pattern.name}`),
        h("span", {
          style: { ...pill, background: color + "22", color },
        }, `${pattern.bars} bar${pattern.bars > 1 ? "s" : ""} \u00B7 ${pattern.notes.length} notes`)
      ),
      h(
        "button",
        {
          onClick: onClose,
          style: {
            background: "none", border: `1px solid ${C.border}`,
            color: C.muted, padding: "4px 10px", borderRadius: 6,
            fontSize: "0.7rem", cursor: "pointer",
          },
        },
        "Close"
      )
    ),
    // Piano roll grid
    h(
      "div",
      {
        style: {
          overflowX: "auto" as const,
          overflowY: "auto" as const,
          maxHeight: 320,
          padding: "4px 0",
        },
      },
      h("div", {
        style: { display: "flex", flexDirection: "column" as const, width: "fit-content" },
      }, ...rows)
    )
  );
}

// ── Add Track Panel ─────────────────────────────────────────────────────

type AddTrackProps = {
  onAddTrack: (instrument: InstrumentType, name: string) => void;
};

export function AddTrackPanel({ onAddTrack }: AddTrackProps) {
  const instruments: InstrumentType[] = ["synth", "bass", "pad", "lead", "keys", "pluck", "drums", "strings"];

  return h(
    "div",
    {
      style: {
        display: "flex",
        gap: 4,
        padding: "8px 12px",
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        flexWrap: "wrap" as const,
        alignItems: "center",
      },
    },
    h("span", { style: { fontSize: "0.65rem", color: C.muted, fontWeight: 600, marginRight: 4 } }, "ADD TRACK:"),
    ...instruments.map(inst => {
      const color = INSTRUMENT_COLORS[inst];
      const icon = INSTRUMENT_ICONS[inst];
      return h(
        "button",
        {
          key: inst,
          onClick: () => onAddTrack(inst, `${inst.charAt(0).toUpperCase() + inst.slice(1)} ${Math.floor(Math.random() * 100)}`),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${color}44`,
            background: color + "11",
            color,
            fontSize: "0.65rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          },
        },
        h("span", null, icon),
        h("span", null, inst)
      );
    })
  );
}
