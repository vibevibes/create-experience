// ── Types ────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const tileSchema = z.object({
  type: z.enum(["floor", "wall", "door", "chest", "trap", "exit"]),
  revealed: z.boolean(),
  entity: z.string().optional(),
});

export const itemSchema = z.object({
  name: z.string(),
  effect: z.string(),
  description: z.string(),
});

export const playerSchema = z.object({
  x: z.number(),
  y: z.number(),
  hp: z.number().min(0).max(100),
  gold: z.number().min(0),
  inventory: z.array(itemSchema),
});

export const stateSchema = z.object({
  phase: z.enum(["intro", "exploring", "encounter", "victory", "defeat"]).default("intro"),
  grid: z.array(z.array(tileSchema)).default([]),
  player: playerSchema.default({ x: 1, y: 1, hp: 100, gold: 0, inventory: [] }),
  narrative: z.array(z.string()).default([]),
  encounter: z.string().optional(),
  encounterChoices: z.array(z.string()).default([]),
  dungeonName: z.string().default("The Unnamed Depths"),
  turnCount: z.number().default(0),
  _chat: z.array(z.any()).default([]),
  _bugReports: z.array(z.any()).default([]),
});

// ── TypeScript Types ─────────────────────────────────────────────────────────

export type Tile = z.infer<typeof tileSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Player = z.infer<typeof playerSchema>;
export type DungeonState = z.infer<typeof stateSchema>;

// ── Constants ────────────────────────────────────────────────────────────────

export const GRID_SIZE = 12;

export const TILE_COLORS: Record<Tile["type"], string> = {
  floor: "#2a2a3a",
  wall: "#1a1a2e",
  door: "#4a3520",
  chest: "#b8860b",
  trap: "#8b0000",
  exit: "#2e8b57",
};

export const TILE_ICONS: Record<Tile["type"], string> = {
  floor: "",
  wall: "",
  door: "\u{1F6AA}",
  chest: "\u{1F4E6}",
  trap: "\u26A0",
  exit: "\u2B50",
};

export const PHASES = ["intro", "exploring", "encounter", "victory", "defeat"] as const;
