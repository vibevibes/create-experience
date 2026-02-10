import { z } from "zod";
import {
  defineTool,
  phaseTool,
  createChatTools,
  createBugReportTools,
} from "@vibevibes/sdk";
import { GRID_SIZE, PHASES } from "./types";
import type { Tile, DungeonState } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function cloneGrid(grid: Tile[][]): Tile[][] {
  return grid.map((row) => row.map((t) => ({ ...t })));
}

function revealAdjacent(grid: Tile[][], x: number, y: number): Tile[][] {
  const g = cloneGrid(grid);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        g[ny][nx] = { ...g[ny][nx], revealed: true };
      }
    }
  }
  return g;
}

function isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1 && !(x1 === x2 && y1 === y2);
}

// ── Tools ────────────────────────────────────────────────────────────────────

export const tools = [
  ...createChatTools(z),
  ...createBugReportTools(z),
  phaseTool(z, PHASES),

  defineTool({
    name: "player.move",
    description: "Move the player to an adjacent tile. Reveals fog of war around the new position.",
    input_schema: z.object({
      x: z.number().min(0).max(GRID_SIZE - 1).describe("Target x coordinate"),
      y: z.number().min(0).max(GRID_SIZE - 1).describe("Target y coordinate"),
    }),
    handler: async (ctx, input: { x: number; y: number }) => {
      const state = ctx.state as DungeonState;
      const { player, grid } = state;
      if (!isAdjacent(player.x, player.y, input.x, input.y)) {
        throw new Error("Can only move to adjacent tiles");
      }
      const tile = grid[input.y]?.[input.x];
      if (!tile || tile.type === "wall") {
        throw new Error("Cannot move into a wall");
      }
      const newGrid = revealAdjacent(grid, input.x, input.y);
      const newPlayer = { ...player, x: input.x, y: input.y };
      let encounter = state.encounter;
      let phase = state.phase;

      if (tile.entity) {
        encounter = tile.entity;
        phase = "encounter";
      }
      if (tile.type === "trap" && !tile.entity) {
        newPlayer.hp = Math.max(0, newPlayer.hp - 10);
        if (newPlayer.hp <= 0) phase = "defeat";
      }
      if (tile.type === "exit") {
        phase = "victory";
      }

      ctx.setState({
        ...state,
        player: newPlayer,
        grid: newGrid,
        phase,
        encounter,
        turnCount: state.turnCount + 1,
      });
      return { moved: true, x: input.x, y: input.y, hp: newPlayer.hp, phase };
    },
  }),

  defineTool({
    name: "dungeon.place_tiles",
    description: "Place or update tiles on the dungeon grid. Used by the dungeon master to build rooms and corridors ahead of the player.",
    input_schema: z.object({
      tiles: z.array(z.object({
        x: z.number().min(0).max(GRID_SIZE - 1),
        y: z.number().min(0).max(GRID_SIZE - 1),
        type: z.enum(["floor", "wall", "door", "chest", "trap", "exit"]),
        revealed: z.boolean().default(false),
      })).min(1).max(50).describe("Array of tiles to place"),
    }),
    handler: async (ctx, input: { tiles: Array<{ x: number; y: number; type: Tile["type"]; revealed: boolean }> }) => {
      const state = ctx.state as DungeonState;
      const grid = cloneGrid(state.grid);
      let placed = 0;
      for (const t of input.tiles) {
        if (t.y < GRID_SIZE && t.x < GRID_SIZE) {
          grid[t.y][t.x] = { type: t.type, revealed: t.revealed, entity: grid[t.y][t.x]?.entity };
          placed++;
        }
      }
      ctx.setState({ ...state, grid });
      return { placed };
    },
  }),

  defineTool({
    name: "dungeon.add_entity",
    description: "Place an entity (monster, NPC, item) on a tile. The entity string is a short description the dungeon master uses to narrate encounters.",
    input_schema: z.object({
      x: z.number().min(0).max(GRID_SIZE - 1),
      y: z.number().min(0).max(GRID_SIZE - 1),
      entity: z.string().min(1).max(100).describe("Entity description, e.g. 'Goblin Archer' or 'Healing Fountain'"),
    }),
    handler: async (ctx, input: { x: number; y: number; entity: string }) => {
      const state = ctx.state as DungeonState;
      const grid = cloneGrid(state.grid);
      if (grid[input.y] && grid[input.y][input.x]) {
        grid[input.y][input.x] = { ...grid[input.y][input.x], entity: input.entity };
      }
      ctx.setState({ ...state, grid });
      return { placed: input.entity, x: input.x, y: input.y };
    },
  }),

  defineTool({
    name: "dungeon.narrate",
    description: "Add a narrative message to the dungeon log. Used by the dungeon master to describe events, atmosphere, and encounters. Also sets encounter choices when applicable.",
    input_schema: z.object({
      message: z.string().min(1).max(500).describe("Narrative text"),
      choices: z.array(z.string()).max(4).optional().describe("Choices for the player during an encounter"),
      dungeonName: z.string().optional().describe("Set the dungeon name"),
    }),
    handler: async (ctx, input: { message: string; choices?: string[]; dungeonName?: string }) => {
      const state = ctx.state as DungeonState;
      const narrative = [...state.narrative, input.message].slice(-30);
      const updates: Partial<DungeonState> = { narrative };
      if (input.choices) updates.encounterChoices = input.choices;
      if (input.dungeonName) updates.dungeonName = input.dungeonName;
      ctx.setState({ ...state, ...updates });
      return { narrated: true };
    },
  }),

  defineTool({
    name: "player.pickup",
    description: "Add an item to the player's inventory and optionally award gold.",
    input_schema: z.object({
      item: z.object({
        name: z.string(),
        effect: z.string(),
        description: z.string(),
      }).optional(),
      gold: z.number().min(0).max(1000).optional(),
      hpChange: z.number().min(-100).max(100).optional().describe("HP change (positive = heal, negative = damage)"),
    }),
    handler: async (ctx, input: { item?: { name: string; effect: string; description: string }; gold?: number; hpChange?: number }) => {
      const state = ctx.state as DungeonState;
      const player = { ...state.player };
      if (input.item) {
        player.inventory = [...player.inventory, input.item];
      }
      if (input.gold) {
        player.gold += input.gold;
      }
      if (input.hpChange) {
        player.hp = Math.max(0, Math.min(100, player.hp + input.hpChange));
      }
      let phase = state.phase;
      if (player.hp <= 0) phase = "defeat";

      // Clear encounter after pickup/resolution
      ctx.setState({
        ...state,
        player,
        phase,
        encounter: undefined,
        encounterChoices: [],
      });
      return { inventory: player.inventory.length, hp: player.hp, gold: player.gold };
    },
  }),

  defineTool({
    name: "player.use_item",
    description: "Use an item from the player's inventory. The item is consumed.",
    input_schema: z.object({
      itemName: z.string().describe("Name of the item to use"),
    }),
    handler: async (ctx, input: { itemName: string }) => {
      const state = ctx.state as DungeonState;
      const idx = state.player.inventory.findIndex((i) => i.name === input.itemName);
      if (idx === -1) throw new Error(`Item "${input.itemName}" not found in inventory`);
      const item = state.player.inventory[idx];
      const newInventory = state.player.inventory.filter((_, i) => i !== idx);
      const player = { ...state.player, inventory: newInventory };

      // Apply known effects
      if (item.effect === "heal") {
        player.hp = Math.min(100, player.hp + 25);
      }
      ctx.setState({ ...state, player });
      return { used: item.name, effect: item.effect, hp: player.hp };
    },
  }),
];
