import React from "react";
import { Badge, Card, Stack, Button, Input, Textarea, Dropdown, useToolCall } from "@vibevibes/sdk";
import type { Passage, Character, WorldNote } from "./types";

const { useState } = React;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAuthor(actorId: string): { name: string; isAI: boolean } {
  const m = actorId.match(/^(.+)-(human|ai)-(\d+)$/);
  if (m) return { name: m[1], isAI: m[2] === "ai" };
  return { name: actorId, isAI: false };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const moodColors: Record<string, string> = {
  tense: "#ef4444",
  dark: "#7c3aed",
  ominous: "#6d28d9",
  hopeful: "#22c55e",
  triumphant: "#eab308",
  whimsical: "#ec4899",
  romantic: "#f472b6",
  neutral: "#94a3b8",
  mysterious: "#8b5cf6",
  melancholy: "#6366f1",
};

function getMoodColor(mood: string): string {
  return moodColors[mood.toLowerCase()] || "#94a3b8";
}

// ── PassageCard ──────────────────────────────────────────────────────────────

export function PassageCard({ passage, index }: { passage: Passage; index: number }) {
  const { name, isAI } = parseAuthor(passage.author);
  const moodColor = getMoodColor(passage.mood);

  return React.createElement("div", {
    style: {
      padding: "16px 20px",
      borderLeft: `3px solid ${moodColor}`,
      background: isAI ? "rgba(139, 92, 246, 0.06)" : "rgba(96, 165, 250, 0.06)",
      borderRadius: "0 8px 8px 0",
      marginBottom: "12px",
      fontFamily: "Georgia, 'Times New Roman', serif",
    },
  },
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
    },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        React.createElement("span", {
          style: {
            fontSize: "11px", fontWeight: 700, color: isAI ? "#a78bfa" : "#60a5fa",
            fontFamily: "system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em",
          },
        }, isAI ? `${name} (AI)` : name),
        React.createElement("span", {
          style: {
            fontSize: "10px", padding: "1px 6px", borderRadius: "4px",
            background: `${moodColor}22`, color: moodColor,
            fontFamily: "system-ui, sans-serif",
          },
        }, passage.mood),
      ),
      React.createElement("span", {
        style: { fontSize: "10px", color: "#6b6b80", fontFamily: "system-ui, sans-serif" },
      }, formatTime(passage.timestamp)),
    ),
    React.createElement("p", {
      style: { margin: 0, fontSize: "14px", lineHeight: 1.7, color: "#e2e2e8", whiteSpace: "pre-wrap" as const },
    }, passage.text),
  );
}

// ── CharacterCard ────────────────────────────────────────────────────────────

const allegianceColors: Record<string, "green" | "red" | "gray" | "purple"> = {
  protagonist: "green",
  antagonist: "red",
  neutral: "gray",
  mysterious: "purple",
};

export function CharacterCard({ character }: { character: Character }) {
  const badgeColor = allegianceColors[character.allegiance.toLowerCase()] || "gray";
  const { isAI } = parseAuthor(character.createdBy);

  return React.createElement(Card, {
    style: {
      background: "#1a1a2e",
      border: "1px solid #2a2a3e",
      padding: "12px",
      borderRadius: "8px",
    },
  },
    React.createElement(Stack, { gap: "6px" },
      React.createElement("div", {
        style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
      },
        React.createElement("span", {
          style: { fontWeight: 700, fontSize: "13px", color: "#fff" },
        }, character.name),
        React.createElement(Badge, {
          color: badgeColor,
          style: { fontSize: "10px" },
        }, character.allegiance),
      ),
      React.createElement("p", {
        style: { margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 },
      }, character.description),
      React.createElement("span", {
        style: { fontSize: "10px", color: "#4a4a5a", fontStyle: "italic" },
      }, `Created by ${isAI ? "AI" : "human"}`),
    ),
  );
}

// ── WorldNoteCard ────────────────────────────────────────────────────────────

export function WorldNoteCard({ note }: { note: WorldNote }) {
  return React.createElement(Card, {
    style: {
      background: "#1a1a2e",
      border: "1px solid #2a2a3e",
      padding: "12px",
      borderRadius: "8px",
    },
  },
    React.createElement(Stack, { gap: "6px" },
      React.createElement("span", {
        style: { fontWeight: 700, fontSize: "12px", color: "#fbbf24" },
      }, note.title),
      React.createElement("p", {
        style: { margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 },
      }, note.content),
    ),
  );
}

// ── StoryTimeline ────────────────────────────────────────────────────────────

export function StoryTimeline({ passages }: { passages: Passage[] }) {
  if (passages.length === 0) {
    return React.createElement("div", {
      style: {
        textAlign: "center", padding: "48px 20px", color: "#4a4a5a",
        fontSize: "14px", fontStyle: "italic",
      },
    }, "The story has not yet begun. Write the first passage to set the stage...");
  }

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column" as const },
  },
    ...passages.map((p, i) =>
      React.createElement(PassageCard, { key: p.id, passage: p, index: i }),
    ),
  );
}

// ── AddCharacterForm ─────────────────────────────────────────────────────────

const darkInput = { background: "#1e293b", border: "1px solid #334155", color: "#fff" };

export function AddCharacterForm({ callTool }: { callTool: any }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [allegiance, setAllegiance] = useState("neutral");
  const { call, loading } = useToolCall(callTool);

  if (!open) {
    return React.createElement(Button, {
      onClick: () => setOpen(true), variant: "ghost", size: "sm",
      style: { width: "100%", color: "#6b6b80" },
    }, "+ Add Character");
  }

  const handleAdd = async () => {
    if (!name.trim()) return;
    await call("story.add_character", { name: name.trim(), description: desc.trim(), allegiance });
    setName(""); setDesc(""); setAllegiance("neutral"); setOpen(false);
  };

  return React.createElement(Stack, { gap: "8px", style: { padding: "8px", background: "#1a1a2e", borderRadius: "8px" } },
    React.createElement(Input, { value: name, onChange: setName, placeholder: "Name", style: darkInput }),
    React.createElement(Input, { value: desc, onChange: setDesc, placeholder: "Description", style: darkInput }),
    React.createElement(Dropdown, {
      value: allegiance, onChange: setAllegiance,
      options: [
        { value: "protagonist", label: "Protagonist" },
        { value: "antagonist", label: "Antagonist" },
        { value: "neutral", label: "Neutral" },
        { value: "mysterious", label: "Mysterious" },
      ],
      style: darkInput,
    }),
    React.createElement(Stack, { direction: "row", gap: "8px" },
      React.createElement(Button, { onClick: handleAdd, disabled: loading || !name.trim(), size: "sm" }, "Add"),
      React.createElement(Button, { onClick: () => setOpen(false), variant: "ghost", size: "sm" }, "Cancel"),
    ),
  );
}

// ── AddLoreForm ──────────────────────────────────────────────────────────────

export function AddLoreForm({ callTool }: { callTool: any }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const { call, loading } = useToolCall(callTool);

  if (!open) {
    return React.createElement(Button, {
      onClick: () => setOpen(true), variant: "ghost", size: "sm",
      style: { width: "100%", color: "#6b6b80" },
    }, "+ Add Lore");
  }

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) return;
    await call("story.add_lore", { title: title.trim(), content: content.trim() });
    setTitle(""); setContent(""); setOpen(false);
  };

  return React.createElement(Stack, { gap: "8px", style: { padding: "8px", background: "#1a1a2e", borderRadius: "8px" } },
    React.createElement(Input, { value: title, onChange: setTitle, placeholder: "Title", style: darkInput }),
    React.createElement(Textarea, { value: content, onChange: setContent, placeholder: "Lore content...", rows: 3, style: darkInput }),
    React.createElement(Stack, { direction: "row", gap: "8px" },
      React.createElement(Button, { onClick: handleAdd, disabled: loading || !title.trim(), size: "sm" }, "Add"),
      React.createElement(Button, { onClick: () => setOpen(false), variant: "ghost", size: "sm" }, "Cancel"),
    ),
  );
}
