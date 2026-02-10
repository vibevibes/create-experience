import { z } from "zod";
import {
  defineTool,
  phaseTool,
  createChatTools,
  createBugReportTools,
} from "@vibevibes/sdk";

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Story Tools ──────────────────────────────────────────────────────────────

const PHASES = ["setup", "writing", "review"] as const;

export const tools = [
  ...createChatTools(z),
  ...createBugReportTools(z),
  phaseTool(z, PHASES),

  // ── story.set_title ──────────────────────────────────────
  defineTool({
    name: "story.set_title",
    description: "Set the story's title. Typically used during setup.",
    input_schema: z.object({
      title: z.string().min(1).max(200).describe("The story title"),
    }),
    handler: async (ctx: any, input: { title: string }) => {
      ctx.setState({ ...ctx.state, title: input.title });
      return { title: input.title };
    },
  }),

  // ── story.set_genre ──────────────────────────────────────
  defineTool({
    name: "story.set_genre",
    description: "Set the story's genre (e.g. fantasy, sci-fi, noir, horror, romance). Typically used during setup.",
    input_schema: z.object({
      genre: z.string().min(1).max(100).describe("The genre of the story"),
    }),
    handler: async (ctx: any, input: { genre: string }) => {
      ctx.setState({ ...ctx.state, genre: input.genre });
      return { genre: input.genre };
    },
  }),

  // ── story.write ──────────────────────────────────────────
  defineTool({
    name: "story.write",
    description: `Write a new passage in the collaborative story. Both humans and the AI co-author use this tool.
Each passage has a mood (e.g. "tense", "hopeful", "ominous", "triumphant") that colors the narrative tone.
Passages should build on what came before — continue the story, introduce twists, develop characters.`,
    input_schema: z.object({
      text: z.string().min(1).max(5000).describe("The story passage text"),
      mood: z.string().max(50).default("neutral").describe("Emotional mood of this passage (e.g. tense, hopeful, dark, whimsical)"),
    }),
    handler: async (ctx: any, input: { text: string; mood: string }) => {
      const passages = [
        ...(ctx.state.passages || []),
        {
          id: uid(),
          author: ctx.actorId,
          text: input.text,
          mood: input.mood || "neutral",
          timestamp: ctx.timestamp,
        },
      ];
      ctx.setState({ ...ctx.state, passages });
      return { passageCount: passages.length, mood: input.mood };
    },
  }),

  // ── story.add_character ──────────────────────────────────
  defineTool({
    name: "story.add_character",
    description: `Introduce a new character into the story world. Characters have a name, description, and allegiance (e.g. "protagonist", "antagonist", "neutral", "mysterious").
The AI co-author may develop characters introduced by the human, and vice versa.`,
    input_schema: z.object({
      name: z.string().min(1).max(100).describe("Character name"),
      description: z.string().min(1).max(1000).describe("Brief character description — appearance, personality, motivation"),
      allegiance: z.string().max(50).default("neutral").describe("Character allegiance or role (protagonist, antagonist, neutral, mysterious)"),
    }),
    handler: async (ctx: any, input: { name: string; description: string; allegiance: string }) => {
      const characters = [
        ...(ctx.state.characters || []),
        {
          id: uid(),
          name: input.name,
          description: input.description,
          allegiance: input.allegiance || "neutral",
          createdBy: ctx.actorId,
        },
      ];
      ctx.setState({ ...ctx.state, characters });
      return { characterCount: characters.length, name: input.name };
    },
  }),

  // ── story.add_lore ───────────────────────────────────────
  defineTool({
    name: "story.add_lore",
    description: `Add a world-building note — a piece of lore, history, geography, or magical system that enriches the story world.
Lore entries are visible to both human and AI, creating shared context for the narrative.`,
    input_schema: z.object({
      title: z.string().min(1).max(200).describe("Short title for the lore entry"),
      content: z.string().min(1).max(2000).describe("The lore content — history, rules, geography, culture"),
    }),
    handler: async (ctx: any, input: { title: string; content: string }) => {
      const worldNotes = [
        ...(ctx.state.worldNotes || []),
        {
          id: uid(),
          title: input.title,
          content: input.content,
          createdBy: ctx.actorId,
          timestamp: ctx.timestamp,
        },
      ];
      ctx.setState({ ...ctx.state, worldNotes });
      return { loreCount: worldNotes.length, title: input.title };
    },
  }),
];
