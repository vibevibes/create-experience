// ── Dungeon Crawl ────────────────────────────────────────────────────────────
//
// The moment:  You click into darkness and the AI builds the dungeon around you
//              in real time — monsters, loot, traps — all narrated dramatically.
//
// The loop:    Human clicks a tile to move → fog reveals → AI places new rooms
//              and entities ahead → encounter triggers → AI narrates and offers
//              choices → human decides → AI resolves → exploration continues.
//
// The surprise: The AI dungeon master doesn't just populate a static map — it
//              reads your playstyle, your HP, your inventory, and builds the
//              world reactively. Low on health? Maybe a healing fountain appears.
//              Hoarding gold? A thief lurks around the corner. The dungeon is
//              alive because the AI is an author, not a random number generator.
import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { agents, observe } from "./agent";
import { stateSchema, GRID_SIZE } from "./types";
import type { Tile } from "./types";

// ── Initial Grid ─────────────────────────────────────────────────────────────

function createInitialGrid(): Tile[][] {
  const grid: Tile[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ type: "wall", revealed: false });
    }
    grid.push(row);
  }
  // Clear starting area — a small room at (1,1)
  for (let dy = 0; dy <= 2; dy++) {
    for (let dx = 0; dx <= 2; dx++) {
      grid[dy][dx] = { type: "floor", revealed: dy <= 2 && dx <= 2 };
    }
  }
  return grid;
}

// ── Initial State ────────────────────────────────────────────────────────────

const initialState = {
  phase: "intro" as const,
  grid: createInitialGrid(),
  player: { x: 1, y: 1, hp: 100, gold: 0, inventory: [] },
  narrative: [],
  encounter: undefined,
  encounterChoices: [],
  dungeonName: "The Unnamed Depths",
  turnCount: 0,
  _chat: [],
  _bugReports: [],
};

// ── Experience Definition ────────────────────────────────────────────────────

export default defineExperience({
  name: "Dungeon Crawl",
  manifest: {
    id: "dungeon-crawl",
    title: "Dungeon Crawl",
    description: "A dungeon crawler where AI is the dungeon master, building the world reactively as you explore",
    version: "1.0.0",
    requested_capabilities: ["state.write"],
    category: "games",
    tags: ["dungeon", "rpg", "ai-dm", "roguelike"],
  },
  stateSchema,
  initialState,
  Canvas,
  tools,
  tests,
  agents,
  observe,
});
