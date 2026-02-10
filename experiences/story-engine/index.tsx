// ── Story Engine ─────────────────────────────────────────────────────────────
//
// The moment:  You write a passage, and the AI responds with a twist you never saw coming.
//              Two minds weaving one narrative, each surprising the other.
//
// The loop:    Human writes a passage → AI responds with its own passage →
//              Characters emerge → Plot thickens → Human builds on the new direction → ...
//
// The surprise: The AI introduces characters who betray expectations, creates dramatic irony
//               only the reader sees, and weaves forgotten threads back into the story
//               at the worst possible moment.
//

import { z } from "zod";
import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { agents, observe } from "./agent";

// ── State Schema ─────────────────────────────────────────────────────────────

const stateSchema = z.object({
  title: z.string().default("").describe("The story title"),
  genre: z.string().default("").describe("Story genre (fantasy, sci-fi, noir, etc.)"),
  phase: z.enum(["setup", "writing", "review"]).default("setup").describe("Current phase"),
  passages: z.array(z.object({
    id: z.string(),
    author: z.string(),
    text: z.string(),
    mood: z.string(),
    timestamp: z.number(),
  })).default([]).describe("Story passages written by human and AI"),
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    allegiance: z.string(),
    createdBy: z.string(),
  })).default([]).describe("Characters in the story"),
  worldNotes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    createdBy: z.string(),
    timestamp: z.number(),
  })).default([]).describe("World-building lore entries"),
  _chat: z.array(z.any()).default([]),
  _bugReports: z.array(z.any()).default([]),
});

// ── Experience Definition ────────────────────────────────────────────────────

export default defineExperience({
  name: "Story Engine",
  manifest: {
    id: "story-engine",
    title: "Story Engine",
    description: "A collaborative storytelling engine where human and AI weave a narrative together",
    version: "1.0.0",
    requested_capabilities: ["state.write"],
    category: "creative",
    tags: ["storytelling", "writing", "collaborative", "narrative"],
  },
  stateSchema,
  Canvas,
  tools,
  tests,
  agents,
  observe,
});
