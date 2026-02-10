import React from "react";
import { Button, Badge, Slider, Dropdown } from "@vibevibes/sdk";
import type { Track, Step, Key, Scale } from "./types";
import { KEYS, SCALES, STEP_COUNT } from "./types";

// ── StepButton ───────────────────────────────────────────────────────────────

export function StepButton({ step, trackColor, isPlayhead, onClick }: {
  step: Step; trackColor: string; isPlayhead: boolean; onClick: () => void;
}) {
  const fillColor = step.active ? (step.color || trackColor) : "rgba(255,255,255,0.04)";
  const opacity = step.active ? 0.3 + step.velocity * 0.7 : 1;
  return React.createElement("button", {
    onClick,
    style: {
      width: 36, height: 36, borderRadius: 4, padding: 0, cursor: "pointer",
      border: `${isPlayhead ? 2 : 1}px solid ${isPlayhead ? "#fff" : "rgba(255,255,255,0.08)"}`,
      backgroundColor: fillColor,
      opacity: step.active ? opacity : 1,
      transition: "background-color 0.1s, border-color 0.1s",
      boxShadow: step.active ? `0 0 8px ${trackColor}44` : "none",
      transform: isPlayhead ? "scale(1.08)" : "scale(1)",
    },
  });
}

// ── TrackRow ─────────────────────────────────────────────────────────────────

export function TrackRow({ track, trackIndex, playhead, onToggle, onMute }: {
  track: Track; trackIndex: number; playhead: number;
  onToggle: (trackIndex: number, stepIndex: number) => void;
  onMute: (trackIndex: number) => void;
}) {
  return React.createElement("div", {
    style: {
      display: "flex", alignItems: "center", gap: 4,
      opacity: track.muted ? 0.35 : 1, transition: "opacity 0.2s",
    },
  },
    React.createElement("button", {
      onClick: () => onMute(trackIndex),
      title: track.muted ? "Unmute" : "Mute",
      style: {
        width: 64, textAlign: "right" as const, fontSize: 11, fontWeight: 600,
        fontFamily: "monospace", color: track.muted ? "#4a4a5a" : track.color,
        background: "none", border: "none", cursor: "pointer",
        padding: "4px 8px 4px 0", textTransform: "uppercase" as const,
        letterSpacing: "0.05em", whiteSpace: "nowrap" as const,
        overflow: "hidden" as const, textOverflow: "ellipsis" as const,
      },
    }, track.name),
    React.createElement("div", {
      style: {
        width: 3, height: 28, borderRadius: 2, marginRight: 4,
        background: `linear-gradient(to top, ${track.color}, ${track.color}00)`,
        opacity: track.volume,
      },
    }),
    ...track.pattern.map((step: Step, stepIdx: number) =>
      React.createElement(StepButton, {
        key: stepIdx, step, trackColor: track.color,
        isPlayhead: stepIdx === playhead,
        onClick: () => onToggle(trackIndex, stepIdx),
      }),
    ),
  );
}

// ── TransportBar ─────────────────────────────────────────────────────────────

const dropdownStyle = {
  padding: "4px 6px", fontSize: 12,
  background: "#1e293b", color: "#e2e2e8", border: "1px solid #334155",
};

export function TransportBar({ bpm, swing, musicKey, scale, playing,
  onBpmChange, onSwingChange, onKeyChange, onScaleChange, onPlayPause,
}: {
  bpm: number; swing: number; musicKey: Key; scale: Scale; playing: boolean;
  onBpmChange: (bpm: number) => void; onSwingChange: (swing: number) => void;
  onKeyChange: (key: string) => void; onScaleChange: (scale: string) => void;
  onPlayPause: () => void;
}) {
  return React.createElement("div", {
    style: {
      display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
      background: "rgba(255,255,255,0.03)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" as const,
    },
  },
    React.createElement(Button, {
      onClick: onPlayPause, variant: playing ? "secondary" : "primary", size: "sm",
      style: { minWidth: 36, fontFamily: "monospace",
        backgroundColor: playing ? "#334155" : "#6366f1", color: "#fff" },
    }, playing ? "||" : ">"),
    React.createElement("div", { style: { width: 140 } },
      React.createElement(Slider, {
        value: bpm, onChange: onBpmChange, min: 60, max: 200, step: 1, label: "BPM",
      }),
    ),
    React.createElement("div", { style: { width: 120 } },
      React.createElement(Slider, {
        value: Math.round(swing * 100),
        onChange: (v: number) => onSwingChange(v / 100),
        min: 0, max: 100, step: 1, label: "Swing",
      }),
    ),
    React.createElement("div", { style: { width: 70 } },
      React.createElement(Dropdown, {
        value: musicKey, onChange: onKeyChange,
        options: KEYS.map((k) => ({ value: k, label: k })),
        style: dropdownStyle,
      }),
    ),
    React.createElement("div", { style: { width: 110 } },
      React.createElement(Dropdown, {
        value: scale, onChange: onScaleChange,
        options: SCALES.map((s) => ({ value: s, label: s })),
        style: dropdownStyle,
      }),
    ),
  );
}

// ── MixerPanel ───────────────────────────────────────────────────────────────

export function MixerPanel({ tracks, onVolumeChange, onMute }: {
  tracks: Track[];
  onVolumeChange: (trackIndex: number, volume: number) => void;
  onMute: (trackIndex: number) => void;
}) {
  return React.createElement("div", {
    style: {
      display: "flex", gap: 8, padding: "12px 16px",
      background: "rgba(255,255,255,0.02)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.06)", overflowX: "auto" as const,
    },
  },
    ...tracks.map((track: Track, i: number) =>
      React.createElement("div", {
        key: i,
        style: {
          display: "flex", flexDirection: "column" as const,
          alignItems: "center", gap: 4, minWidth: 48,
        },
      },
        React.createElement("div", { style: { width: 48 } },
          React.createElement(Slider, {
            value: Math.round(track.volume * 100),
            onChange: (v: number) => onVolumeChange(i, v / 100),
            min: 0, max: 100, step: 1,
          }),
        ),
        React.createElement(Badge, {
          color: track.muted ? "red" : "green",
          style: { cursor: "pointer", fontSize: 9, userSelect: "none" as const },
        }, React.createElement("span", {
          onClick: () => onMute(i), style: { cursor: "pointer" },
        }, track.muted ? "M" : "ON")),
        React.createElement("span", {
          style: {
            fontSize: 9, color: track.color, fontWeight: 600,
            textTransform: "uppercase" as const, letterSpacing: "0.04em",
          },
        }, track.instrument.slice(0, 4)),
      ),
    ),
  );
}

// ── Step Number Labels ───────────────────────────────────────────────────────

export function StepLabels() {
  return React.createElement("div", {
    style: { display: "flex", gap: 4, marginLeft: 71, marginBottom: 2 },
  },
    ...Array.from({ length: STEP_COUNT }, (_, i) =>
      React.createElement("div", {
        key: i,
        style: {
          width: 36, textAlign: "center" as const, fontSize: 9,
          color: i % 4 === 0 ? "#6b7280" : "#3a3a4a",
          fontFamily: "monospace", fontWeight: i % 4 === 0 ? 700 : 400,
        },
      }, String(i + 1)),
    ),
  );
}
