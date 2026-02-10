import React from "react";
import { ChatPanel, ReportBug, useToolCall, useThrottle } from "@vibevibes/sdk";
import { TrackRow, TransportBar, MixerPanel, StepLabels } from "./components";
import { createInitialState, STEP_COUNT } from "./types";
import type { Track, SequencerState } from "./types";

const { useEffect, useRef, useCallback } = React;

// ── Playhead Animation Hook ──────────────────────────────────────────────────

function usePlayhead(
  bpm: number,
  playing: boolean,
  callTool: (name: string, input: any) => Promise<any>,
) {
  const stepRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const stepDurationMs = (60 / bpm / 4) * 1000; // 16th note duration
    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current;
      if (elapsed >= stepDurationMs) {
        lastTickRef.current = now - (elapsed % stepDurationMs);
        stepRef.current = (stepRef.current + 1) % STEP_COUNT;
        // Fire and forget -- playhead is a visual-only mutation
        callTool("seq.toggle", {
          trackIndex: 0,
          stepIndex: stepRef.current,
          active: undefined, // No-op trick: we use a dedicated approach below
        }).catch(() => {});
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [bpm, playing, callTool]);

  return stepRef;
}

// ── Canvas ───────────────────────────────────────────────────────────────────

export function Canvas(props: any) {
  const {
    sharedState,
    callTool,
    actorId,
    participants,
    ephemeralState,
    setEphemeral,
  } = props;

  const defaults = createInitialState();
  const state: SequencerState = {
    tracks: sharedState.tracks ?? defaults.tracks,
    bpm: sharedState.bpm ?? defaults.bpm,
    swing: sharedState.swing ?? defaults.swing,
    key: sharedState.key ?? defaults.key,
    scale: sharedState.scale ?? defaults.scale,
    playhead: sharedState.playhead ?? 0,
    playing: sharedState.playing ?? true,
    _chat: sharedState._chat ?? [],
    _bugReports: sharedState._bugReports ?? [],
  };

  const { call, loading } = useToolCall(callTool);
  const throttledCall = useThrottle(callTool, 80);

  // ── Visual playhead via CSS animation ──────────────────────
  // We track playhead position locally for smooth animation
  const playheadRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const [localPlayhead, setLocalPlayhead] = React.useState(0);

  useEffect(() => {
    if (!state.playing) return;

    const stepMs = (60 / state.bpm / 4) * 1000;
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - lastTimeRef.current;
      if (elapsed >= stepMs) {
        lastTimeRef.current = now - (elapsed % stepMs);
        playheadRef.current = (playheadRef.current + 1) % STEP_COUNT;
        setLocalPlayhead(playheadRef.current);
      }
      raf = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.bpm, state.playing]);

  // ── Handlers ───────────────────────────────────────────────

  const handleToggle = useCallback((trackIndex: number, stepIndex: number) => {
    call("seq.toggle", { trackIndex, stepIndex }).catch(() => {});
  }, [call]);

  const handleMute = useCallback((trackIndex: number) => {
    call("seq.mute", { trackIndex }).catch(() => {});
  }, [call]);

  const handleBpmChange = useCallback((bpm: number) => {
    throttledCall("seq.set_bpm", { bpm }).catch(() => {});
  }, [throttledCall]);

  const handleSwingChange = useCallback((swing: number) => {
    throttledCall("seq.set_swing", { swing }).catch(() => {});
  }, [throttledCall]);

  const handleKeyChange = useCallback((key: string) => {
    call("seq.set_key", { key }).catch(() => {});
  }, [call]);

  const handleScaleChange = useCallback((scale: string) => {
    call("seq.set_key", { scale }).catch(() => {});
  }, [call]);

  const handlePlayPause = useCallback(() => {
    call("seq.play_pause", {}).catch(() => {});
  }, [call]);

  const handleVolumeChange = useCallback((trackIndex: number, volume: number) => {
    throttledCall("seq.set_volume", { trackIndex, volume }).catch(() => {});
  }, [throttledCall]);

  // ── Render ─────────────────────────────────────────────────

  return React.createElement("div", {
    style: {
      width: "100vw",
      height: "100vh",
      background: "#0a0a0f",
      color: "#e2e2e8",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column" as const,
      overflow: "hidden",
    },
  },
    // Header
    React.createElement("div", {
      style: {
        padding: "16px 24px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
    },
      React.createElement("h1", {
        style: {
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          background: "linear-gradient(135deg, #6366f1, #ec4899)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.02em",
        },
      }, "Music Jam"),
      React.createElement("span", {
        style: { fontSize: 11, color: "#4a4a5a" },
      }, `${participants.length} in session`),
    ),

    // Transport controls
    React.createElement("div", { style: { padding: "8px 24px" } },
      React.createElement(TransportBar, {
        bpm: state.bpm,
        swing: state.swing,
        musicKey: state.key,
        scale: state.scale,
        playing: state.playing,
        onBpmChange: handleBpmChange,
        onSwingChange: handleSwingChange,
        onKeyChange: handleKeyChange,
        onScaleChange: handleScaleChange,
        onPlayPause: handlePlayPause,
      }),
    ),

    // Sequencer grid
    React.createElement("div", {
      style: {
        flex: 1,
        padding: "8px 24px",
        display: "flex",
        flexDirection: "column" as const,
        gap: 2,
        justifyContent: "center",
        overflowX: "auto" as const,
      },
    },
      React.createElement(StepLabels),
      ...state.tracks.map((track: Track, i: number) =>
        React.createElement(TrackRow, {
          key: i,
          track,
          trackIndex: i,
          playhead: localPlayhead,
          onToggle: handleToggle,
          onMute: handleMute,
        }),
      ),
    ),

    // Mixer panel
    React.createElement("div", { style: { padding: "8px 24px 16px" } },
      React.createElement(MixerPanel, {
        tracks: state.tracks,
        onVolumeChange: handleVolumeChange,
        onMute: handleMute,
      }),
    ),

    // Chat
    React.createElement(ChatPanel, {
      sharedState,
      callTool,
      actorId,
      ephemeralState,
      setEphemeral,
      participants,
    }),

    // Bug report
    React.createElement(ReportBug, {
      callTool,
      actorId,
    }),
  );
}
