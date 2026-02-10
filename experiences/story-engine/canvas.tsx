import React from "react";
import {
  usePhase,
  useToolCall,
  Button,
  Input,
  Textarea,
  Badge,
  Stack,
  Tabs,
  ChatPanel,
  ReportBug,
  Dropdown,
} from "@vibevibes/sdk";
import {
  StoryTimeline, CharacterCard, WorldNoteCard,
  AddCharacterForm, AddLoreForm,
} from "./components";
import type { StoryState } from "./types";

const { useState, useRef, useEffect, useCallback } = React;

const PHASES = ["setup", "writing", "review"] as const;

// ── Canvas ───────────────────────────────────────────────────────────────────

export function Canvas(props: any) {
  const { sharedState, callTool, actorId, participants, ephemeralState, setEphemeral } = props;
  const state = sharedState as StoryState;
  const phase = usePhase(sharedState, callTool, { phases: PHASES });

  if (phase.is("setup")) {
    return React.createElement(SetupPhase, { state, callTool, phase });
  }

  if (phase.is("review")) {
    return React.createElement(ReviewPhase, { state, callTool, phase });
  }

  return React.createElement("div", {
    style: {
      width: "100vw", height: "100vh", background: "#0d0d14",
      display: "flex", flexDirection: "row" as const, overflow: "hidden",
      fontFamily: "system-ui, -apple-system, sans-serif", color: "#e2e2e8",
    },
  },
    React.createElement(StoryPanel, { state, callTool }),
    React.createElement(SidePanel, { state, callTool }),
    React.createElement(ChatPanel, { sharedState, callTool, actorId, ephemeralState, setEphemeral, participants }),
    React.createElement(ReportBug, { callTool, actorId }),
  );
}

// ── Setup Phase ──────────────────────────────────────────────────────────────

function SetupPhase({ state, callTool, phase }: any) {
  const [title, setTitle] = useState(state.title || "");
  const [genre, setGenre] = useState(state.genre || "");
  const { call, loading } = useToolCall(callTool);

  const handleStart = useCallback(async () => {
    if (title.trim()) await call("story.set_title", { title: title.trim() });
    if (genre.trim()) await call("story.set_genre", { genre: genre.trim() });
    phase.next();
  }, [title, genre, call, phase]);

  return React.createElement("div", {
    style: { width: "100vw", height: "100vh", background: "#0d0d14", display: "flex", alignItems: "center", justifyContent: "center" },
  },
    React.createElement("div", {
      style: { maxWidth: "480px", width: "90%", padding: "40px", background: "#111118", borderRadius: "16px", border: "1px solid #1e1e2e" },
    },
      React.createElement("h1", {
        style: { margin: "0 0 8px", fontSize: "24px", fontWeight: 700, color: "#fff", textAlign: "center" },
      }, "Story Engine"),
      React.createElement("p", {
        style: { margin: "0 0 32px", fontSize: "14px", color: "#6b6b80", textAlign: "center" },
      }, "A collaborative story between human and AI minds"),
      React.createElement(Stack, { gap: "16px" },
        React.createElement(Input, {
          value: title, onChange: setTitle, placeholder: "Give your story a title...",
          style: { background: "#1e293b", border: "1px solid #334155", color: "#fff" },
        }),
        React.createElement(Dropdown, {
          value: genre, onChange: setGenre, placeholder: "Choose a genre...",
          options: [
            { value: "fantasy", label: "Fantasy" }, { value: "sci-fi", label: "Science Fiction" },
            { value: "noir", label: "Noir" }, { value: "horror", label: "Horror" },
            { value: "romance", label: "Romance" }, { value: "mystery", label: "Mystery" },
            { value: "literary", label: "Literary Fiction" }, { value: "folklore", label: "Folklore" },
          ],
          style: { background: "#1e293b", border: "1px solid #334155", color: "#fff" },
        }),
        React.createElement(Button, {
          onClick: handleStart, disabled: loading || !title.trim(), variant: "primary", size: "lg",
          style: { width: "100%", marginTop: "8px" },
        }, "Begin the Story"),
      ),
    ),
  );
}

// ── Review Phase ─────────────────────────────────────────────────────────────

function ReviewPhase({ state, callTool, phase }: any) {
  const passages = state.passages || [];
  const characters = state.characters || [];

  return React.createElement("div", {
    style: { width: "100vw", height: "100vh", background: "#0d0d14", overflow: "auto", display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "40px 20px" },
  },
    React.createElement("div", { style: { maxWidth: "720px", width: "100%" } },
      React.createElement("h1", {
        style: { fontSize: "28px", fontWeight: 700, color: "#fff", marginBottom: "4px", textAlign: "center" },
      }, state.title || "Untitled"),
      React.createElement("div", { style: { textAlign: "center", marginBottom: "32px" } },
        state.genre ? React.createElement(Badge, { color: "purple" }, state.genre) : null,
        React.createElement("span", { style: { fontSize: "13px", color: "#6b6b80", marginLeft: "12px" } },
          `${passages.length} passages, ${characters.length} characters`),
      ),
      React.createElement(StoryTimeline, { passages }),
      React.createElement("div", { style: { marginTop: "24px", display: "flex", gap: "12px", justifyContent: "center" } },
        React.createElement(Button, { onClick: phase.prev, variant: "secondary" }, "Back to Writing"),
      ),
    ),
  );
}

// ── Story Panel ──────────────────────────────────────────────────────────────

function StoryPanel({ state, callTool }: any) {
  const [text, setText] = useState("");
  const [mood, setMood] = useState("neutral");
  const { call, loading } = useToolCall(callTool);
  const scrollRef = useRef(null as any);
  const passages = state.passages || [];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [passages.length]);

  const handleWrite = useCallback(async () => {
    if (!text.trim() || loading) return;
    await call("story.write", { text: text.trim(), mood });
    setText("");
  }, [text, mood, loading, call]);

  const moods = ["neutral", "tense", "hopeful", "dark", "whimsical", "mysterious"];

  return React.createElement("div", {
    style: { flex: 1, display: "flex", flexDirection: "column" as const, borderRight: "1px solid #1e1e2e" },
  },
    React.createElement("div", {
      style: { padding: "16px 24px", borderBottom: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" },
    },
      React.createElement("div", null,
        React.createElement("h2", { style: { margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" } }, state.title || "Untitled Story"),
        state.genre ? React.createElement(Badge, { color: "purple", style: { marginTop: "4px" } }, state.genre) : null,
      ),
      React.createElement(Badge, { color: "blue" }, `${passages.length} passages`),
    ),
    React.createElement("div", { ref: scrollRef, style: { flex: 1, overflowY: "auto" as const, padding: "20px 24px" } },
      React.createElement(StoryTimeline, { passages }),
    ),
    React.createElement("div", { style: { padding: "16px 24px", borderTop: "1px solid #1e1e2e", background: "#111118" } },
      React.createElement("div", { style: { display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" } },
        React.createElement("span", { style: { fontSize: "11px", color: "#6b6b80" } }, "Mood:"),
        ...moods.map((m) =>
          React.createElement("button", {
            key: m, onClick: () => setMood(m),
            style: {
              padding: "2px 8px", fontSize: "11px", borderRadius: "4px", cursor: "pointer",
              border: mood === m ? "1px solid #6366f1" : "1px solid #2a2a3e",
              background: mood === m ? "#6366f122" : "transparent",
              color: mood === m ? "#a5b4fc" : "#6b6b80",
            },
          }, m),
        ),
      ),
      React.createElement("div", { style: { display: "flex", gap: "8px" } },
        React.createElement(Textarea, {
          value: text, onChange: setText, placeholder: "Write your passage...", rows: 3,
          style: { flex: 1, background: "#1e293b", border: "1px solid #334155", color: "#fff", fontFamily: "Georgia, serif", fontSize: "14px" },
        }),
        React.createElement(Button, {
          onClick: handleWrite, disabled: loading || !text.trim(), variant: "primary", style: { alignSelf: "flex-end" },
        }, loading ? "..." : "Write"),
      ),
    ),
  );
}

// ── Side Panel ───────────────────────────────────────────────────────────────

function SidePanel({ state, callTool }: any) {
  const [tab, setTab] = useState("characters");
  const characters = state.characters || [];
  const worldNotes = state.worldNotes || [];
  const phase = usePhase(state, callTool, { phases: PHASES });

  return React.createElement("div", {
    style: { width: "300px", display: "flex", flexDirection: "column" as const, background: "#111118" },
  },
    React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid #1e1e2e", display: "flex", gap: "8px" } },
      React.createElement(Button, { onClick: phase.prev, disabled: phase.isFirst, variant: "ghost", size: "sm" }, "Setup"),
      React.createElement(Button, { onClick: () => phase.goTo("review"), variant: "ghost", size: "sm" }, "Review"),
    ),
    React.createElement(Tabs, {
      tabs: [
        { id: "characters", label: `Characters (${characters.length})` },
        { id: "lore", label: `Lore (${worldNotes.length})` },
      ],
      activeTab: tab, onTabChange: setTab,
      style: { padding: "0 16px", borderBottom: "1px solid #1e1e2e" },
    }),
    React.createElement("div", { style: { flex: 1, overflowY: "auto" as const, padding: "12px 16px" } },
      tab === "characters"
        ? React.createElement(Stack, { gap: "8px" },
            ...characters.map((c: any) => React.createElement(CharacterCard, { key: c.id, character: c })),
            React.createElement(AddCharacterForm, { callTool }),
          )
        : React.createElement(Stack, { gap: "8px" },
            ...worldNotes.map((n: any) => React.createElement(WorldNoteCard, { key: n.id, note: n })),
            React.createElement(AddLoreForm, { callTool }),
          ),
    ),
  );
}
